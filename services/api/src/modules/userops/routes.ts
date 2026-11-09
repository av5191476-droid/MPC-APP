import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { encodeCallData, encodeNonce, getUserOpHash, requiresStepUp, spendsOf, type UserOperation } from '@hw/sdk';
import type { Address, Hex } from 'viem';
import type { BundlerClient, PaymasterClient } from '../../adapters/types';

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const PrepareBody = z.object({
  accountId: z.string().uuid(),
  chainId: z.number().int().positive(),
  calls: z.array(z.object({ to: address, value: z.string().regex(/^\d+$/).optional(), data: hex.optional() })).min(1).max(16),
  gasMode: z.enum(['sponsored', 'erc20', 'self']).default('sponsored'),
});

export type UserOpDeps = {
  bundler: BundlerClient;
  paymaster: PaymasterClient;
  entryPoint: Address;
  recordBuilt?(accountId: string, chainId: number, op: UserOperation, hash: Hex, sponsorship: string): Promise<void>;
  loadAccount(id: string, userId: string): Promise<{ address: Address; webauthnValidator: Address; nextSeq: bigint; limits: Parameters<typeof requiresStepUp>[1] } | null>;
};

/** POST /userops/prepare (FR-009, FR-010): construye, simula y cotiza. Nunca firma. */
export const userOpRoutes = (deps: UserOpDeps): FastifyPluginAsync => async (app) => {
  app.post('/userops/prepare', async (req, reply) => {
    const body = PrepareBody.parse(req.body);
    const userId = req.user.sub;
    const acc = await deps.loadAccount(body.accountId, userId);
    if (!acc) return reply.code(404).send({ error: 'cuenta no encontrada' });

    const calls = body.calls.map((c) => ({ to: c.to as Address, value: c.value ? BigInt(c.value) : 0n, data: (c.data ?? '0x') as Hex }));
    const stepUp = requiresStepUp(spendsOf(calls, acc.address), acc.limits, Math.floor(Date.now() / 1000));

    let op: UserOperation = {
      sender: acc.address,
      nonce: encodeNonce(acc.webauthnValidator, acc.nextSeq),
      initCode: '0x',
      callData: encodeCallData(calls),
      callGasLimit: 0n, verificationGasLimit: 0n, preVerificationGas: 0n,
      maxFeePerGas: 0n, maxPriorityFeePerGas: 0n,
      paymasterAndData: '0x',
      signature: '0x',
    };
    op = { ...op, ...(await deps.bundler.estimate(op, body.chainId)) };

    let fee: { token: string; amount: string; sponsored: boolean } = { token: 'native', amount: '0', sponsored: false };
    if (body.gasMode === 'sponsored') {
      const s = await deps.paymaster.sponsor(op, body.chainId, 'default');
      if ('paymasterAndData' in s) { op.paymasterAndData = s.paymasterAndData; fee = { token: 'none', amount: '0', sponsored: true }; }
      else return reply.code(409).send({ error: 'patrocinio no disponible', reason: s.reason, fallback: 'erc20' });
    }

    // También se usa como "simulación" de cambios de saldo esperados (FR-009).
    await deps.recordBuilt?.(body.accountId, body.chainId, op, getUserOpHash(op, deps.entryPoint, body.chainId), fee.sponsored ? 'sponsored' : body.gasMode);
    return {
      userOp: op,
      userOpHash: getUserOpHash(op, deps.entryPoint, body.chainId),
      fee,
      requiresStepUp: stepUp,
    };
  });
};

/** POST /userops/submit y GET /userops/:hash (FR-009, US2-AS4). */
export const userOpSubmitRoutes = (deps: UserOpDeps & { db: import('@prisma/client').PrismaClient }): FastifyPluginAsync => async (app) => {
  app.post('/userops/submit', async (req, reply) => {
    const { chainId, userOp } = z.object({ chainId: z.number().int(), userOp: z.record(z.string()) }).parse(req.body);
    const { fromJson } = await import('../mpc-coordinator/userop-json');
    const op = fromJson(userOp);
    const hash = await deps.bundler.send(op, chainId);
    await deps.db.userOpRecord.updateMany({ where: { userOpHash: Buffer.from(hash.slice(2), 'hex') }, data: { status: 'submitted' } });
    return reply.code(202).send({ userOpHash: hash });
  });

  app.get('/userops/:hash', async (req) => {
    const { hash } = req.params as { hash: Hex };
    const rec = await deps.db.userOpRecord.findUnique({ where: { userOpHash: Buffer.from(hash.slice(2), 'hex') } });
    if (!rec) return { userOpHash: hash, status: 'built' };
    if (rec.status === 'submitted') {
      const r = await deps.bundler.receipt(hash, rec.chainId);
      if (r && r.status !== 'pending') {
        const status = r.status === 'included' ? 'included' : 'failed';
        await deps.db.userOpRecord.update({ where: { userOpHash: rec.userOpHash }, data: { status, txHash: r.txHash ? Buffer.from(r.txHash.slice(2), 'hex') : null } });
        return { userOpHash: hash, status, txHash: r.txHash };
      }
    }
    return { userOpHash: hash, status: rec.status, revertReason: rec.revertReason ?? undefined, blockNumber: rec.blockNumber ? Number(rec.blockNumber) : undefined };
  });
};
