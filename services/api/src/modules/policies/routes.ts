import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { encodeFunctionData, getAddress, bytesToHex, hexToBytes, type Address, type Hex } from 'viem';
import { encodeCallData, encodeNonce, getUserOpHash, type UserOperation } from '@hw/sdk';
import type { AppContext } from '../../lib/context';
import { httpError } from '../../lib/errors';

const hookAbi = [
  { type: 'function', name: 'setLimit', inputs: [{ type: 'address' }, { type: 'uint128' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'proposeLimit', inputs: [{ type: 'address' }, { type: 'uint128' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelPending', inputs: [{ type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

/**
 * FR-013 a FR-016. Prepara UserOps admin; endurecer va por el validador WebAuthn (passkey sola),
 * relajar por el mismo validador pero con firma compuesta, y se notifica por todos los canales.
 */
export const policyRoutes = (ctx: AppContext, build: (accountId: string, chainId: number, op: UserOperation) => Promise<UserOperation>): FastifyPluginAsync => async (app) => {
  const own = async (id: string, userId: string) => {
    const a = await ctx.db.smartAccount.findFirst({ where: { id, userId }, include: { policies: true } });
    if (!a) throw httpError(404, 'cuenta no encontrada');
    return a;
  };

  app.get('/policies/:accountId', async (req) => {
    const a = await own((req.params as { accountId: string }).accountId, req.user.sub);
    return Promise.all(a.policies.map(async (p) => {
      const spent = (await ctx.redis.hget(`spent:${a.id}:${p.chainId}`, bytesToHex(p.token))) ?? '0';
      return { chainId: p.chainId, token: getAddress(bytesToHex(p.token)), periodSeconds: p.periodSeconds, limitAmount: p.limitAmount.toFixed(), spent, windowStart: 0, pendingChange: p.pendingChange };
    }));
  });

  app.put('/policies/:accountId', async (req) => {
    const a = await own((req.params as { accountId: string }).accountId, req.user.sub);
    const b = z.object({ chainId: z.number().int(), token: z.string(), limitAmount: z.string().regex(/^\d+$/), periodSeconds: z.number().int().min(3600) }).parse(req.body);
    const current = a.policies.find((p) => p.chainId === b.chainId && bytesToHex(p.token).toLowerCase() === b.token.toLowerCase());
    const next = BigInt(b.limitAmount);
    const tighten = !current || (next <= BigInt(current.limitAmount.toFixed()) && b.periodSeconds >= current.periodSeconds);
    const data = encodeFunctionData({ abi: hookAbi, functionName: tighten ? 'setLimit' : 'proposeLimit', args: [b.token as Address, next, b.periodSeconds] });

    const seq = BigInt(await ctx.redis.incr(`nonce:${a.id}:${b.chainId}`));
    let op: UserOperation = {
      sender: getAddress(bytesToHex(a.address)), nonce: encodeNonce(ctx.config.modules.webauthn, seq), initCode: '0x',
      callData: encodeCallData([{ to: ctx.config.modules.policy, data }]),
      callGasLimit: 0n, verificationGasLimit: 0n, preVerificationGas: 0n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, paymasterAndData: '0x', signature: '0x',
    };
    op = await build(a.id, b.chainId, op);
    const userOpHash = getUserOpHash(op, ctx.config.entryPoint, b.chainId);

    if (!tighten) {
      // El aviso de 48 h empieza aquí; evaluateCosign lo exige para cambios admin con llave raíz.
      await ctx.redis.set(`admin-notice:${a.id}`, String(Math.floor(Date.now() / 1000)));
      await ctx.db.policy.update({ where: { accountId_chainId_token: { accountId: a.id, chainId: b.chainId, token: hexToBytes(b.token as Hex) } }, data: { pendingChange: { limitAmount: b.limitAmount, effectiveAt: Math.floor(Date.now() / 1000) + 48 * 3600 } } });
      await ctx.notify(a.userId, { title: 'Pidieron subir tu límite', body: 'Entra en vigor en 48 h. Si no fuiste tú, cancélalo en Seguridad.', screen: 'security', channels: ['push', 'email', 'sms'] });
    }
    return { kind: tighten ? 'tighten' : 'relax', userOp: op, userOpHash, fee: { token: 'none', amount: '0', sponsored: true }, requiresStepUp: !tighten };
  });

  app.delete('/policies/:accountId/pending', async (req) => {
    const a = await own((req.params as { accountId: string }).accountId, req.user.sub);
    const b = z.object({ chainId: z.number().int(), token: z.string() }).parse(req.body);
    await ctx.db.policy.update({ where: { accountId_chainId_token: { accountId: a.id, chainId: b.chainId, token: hexToBytes(b.token as Hex) } }, data: { pendingChange: undefined } });
    return { ok: true, calldata: encodeFunctionData({ abi: hookAbi, functionName: 'cancelPending', args: [b.token as Address] }) };
  });
};
