import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { bytesToHex, getAddress, hexToBytes, publicKeyToAddress, type Hex } from 'viem';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { AppContext } from '../../lib/context';
import { httpError } from '../../lib/errors';

const hex = (b: Uint8Array) => bytesToHex(b);

/** Registro de la cuenta tras el DKG (mpc-protocol §1.6) y activación de redes (US6). */
export const accountRoutes = (ctx: AppContext): FastifyPluginAsync => async (app) => {
  app.post('/accounts', async (req, reply) => {
    const body = z.object({ mpcPublicKey: z.string(), dkgSessionId: z.string().uuid(), credentialId: z.string() }).parse(req.body);
    const userId = req.user.sub;
    // El enclave confirma que este DKG produjo esta PK y devuelve los compromisos de las 3 partes.
    const dkg = await ctx.redis.get(`dkg:done:${body.dkgSessionId}`);
    if (!dkg) throw httpError(409, 'DKG no confirmado por el enclave');
    const result = JSON.parse(dkg) as { userId: string; publicKey: Hex; commitments: Record<'device' | 'server' | 'backup', Hex>; blobRef: string };
    if (result.userId !== userId || result.publicKey !== body.mpcPublicKey) throw httpError(409, 'la llave no corresponde a esta sesión');

    const pk = hexToBytes(result.publicKey);
    const address = publicKeyToAddress(bytesToHex(secp256k1.ProjectivePoint.fromHex(pk).toRawBytes(false)));
    const account = await ctx.db.smartAccount.create({
      data: {
        userId, address: hexToBytes(address), mpcPublicKey: pk, implementation: hexToBytes(ctx.config.implementation),
        shares: { create: (['device', 'server', 'backup'] as const).map((role) => ({ role, epoch: 0, publicCommitment: hexToBytes(result.commitments[role]), enclaveBlobRef: role === 'server' ? result.blobRef : null })) },
        chains: { create: [{ chainId: Number(process.env.DEFAULT_CHAIN_ID ?? 84532), modulesVersion: '0.1.0' }] },
      },
    });
    await ctx.redis.del(`dkg:done:${body.dkgSessionId}`);
    return reply.code(201).send(toDto(account, [], ctx));
  });

  app.get('/accounts', async (req) => {
    const rows = await ctx.db.smartAccount.findMany({ where: { userId: req.user.sub }, include: { chains: true, shares: { where: { status: 'active' } } } });
    return rows.map((a) => toDto(a, a.chains, ctx, a.shares[0]?.epoch));
  });

  app.get('/accounts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const a = await ctx.db.smartAccount.findFirst({ where: { id, userId: req.user.sub }, include: { chains: true, shares: { where: { status: 'active' } } } });
    if (!a) throw httpError(404, 'cuenta no encontrada');
    return toDto(a, a.chains, ctx, a.shares[0]?.epoch);
  });

  /** Encola la autorización 7702 para otra red; el worker la co-firma con MPC y replica módulos. */
  app.post('/accounts/:id/chains', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { chainId } = z.object({ chainId: z.number().int() }).parse(req.body);
    const a = await ctx.db.smartAccount.findFirst({ where: { id, userId: req.user.sub } });
    if (!a) throw httpError(404, 'cuenta no encontrada');
    await ctx.db.accountChain.upsert({ where: { accountId_chainId: { accountId: id, chainId } }, create: { accountId: id, chainId, modulesVersion: '0.1.0' }, update: {} });
    await ctx.redis.lpush('jobs:activate-chain', JSON.stringify({ accountId: id, chainId }));
    return reply.code(202).send({ status: 'pending' });
  });
};

function toDto(a: { id: string; address: Uint8Array }, chains: { chainId: number; status: string }[], ctx: AppContext, epoch = 0) {
  return { id: a.id, address: getAddress(hex(a.address)), webauthnValidator: ctx.config.modules.webauthn, epoch, chains: chains.map((c) => ({ chainId: c.chainId, status: c.status })) };
}
