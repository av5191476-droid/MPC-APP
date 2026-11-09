import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { bytesToHex, getAddress, hexToBytes, type Hex } from 'viem';
import type { AppContext } from '../../lib/context';
import { httpError } from '../../lib/errors';

/** FR-011 (saldos e historial), FR-012 (token push), FR-021 (session keys). */
export const activityRoutes = (ctx: AppContext): FastifyPluginAsync => async (app) => {
  app.get('/activity', async (req) => {
    const q = z.object({ accountId: z.string().uuid(), only: z.enum(['balances']).optional() }).parse(req.query);
    const acc = await ctx.db.smartAccount.findFirst({ where: { id: q.accountId, userId: req.user.sub } });
    if (!acc) throw httpError(404, 'cuenta no encontrada');
    // El indexador (T065) mantiene saldos por red en Redis.
    const balances = JSON.parse((await ctx.redis.get(`balances:${acc.id}`)) ?? '[]');
    if (q.only === 'balances') return { balances };
    const ops = await ctx.db.userOpRecord.findMany({ where: { accountId: acc.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    const incoming = JSON.parse((await ctx.redis.get(`incoming:${acc.id}`)) ?? '[]');
    const items = [
      ...incoming,
      ...ops.map((o) => ({
        id: bytesToHex(o.userOpHash), kind: o.kind === 'transfer' ? (o.status === 'failed' ? 'rejected' : 'out') : o.kind === 'dapp' ? 'dapp' : 'admin',
        amount: o.amount?.toFixed() ?? '0', token: 'USDC', counterparty: o.to ? getAddress(bytesToHex(o.to)) : undefined, chainId: o.chainId, at: Math.floor(o.createdAt.getTime() / 1000),
      })),
    ].sort((a, b) => b.at - a.at);
    return { balances, items };
  });

  app.put('/devices/push-token', async (req, reply) => {
    const b = z.object({ token: z.string().min(10), platform: z.enum(['ios', 'android']) }).parse(req.body);
    await ctx.db.pushToken.upsert({ where: { token: b.token }, create: { ...b, userId: req.user.sub }, update: { userId: req.user.sub } });
    return reply.code(204).send();
  });

  app.get('/session-keys', async (req) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(req.query);
    const rows = await ctx.db.sessionKey.findMany({ where: { accountId, account: { userId: req.user.sub } } });
    const now = Date.now();
    return rows.map((s) => ({ id: s.id, dappOrigin: s.dappOrigin, validUntil: Math.floor(s.validUntil.getTime() / 1000), status: s.status === 'active' && s.validUntil.getTime() < now ? 'expired' : s.status }));
  });

  app.post('/session-keys', async (req, reply) => {
    const b = z.object({ accountId: z.string().uuid(), sessionKey: z.string(), dappOrigin: z.string().url(), permissions: z.array(z.object({ target: z.string(), selector: z.string(), token: z.string(), maxAmount: z.string(), validUntil: z.number() })).min(1).max(8) }).parse(req.body);
    const acc = await ctx.db.smartAccount.findFirst({ where: { id: b.accountId, userId: req.user.sub } });
    if (!acc) throw httpError(404, 'cuenta no encontrada');
    const validUntil = Math.min(...b.permissions.map((p) => p.validUntil));
    if (validUntil * 1000 - Date.now() > 7 * 86_400_000) throw httpError(400, 'una session key no puede durar más de 7 días');
    const row = await ctx.db.sessionKey.create({ data: { accountId: acc.id, chainId: Number(process.env.DEFAULT_CHAIN_ID ?? 84532), dappOrigin: b.dappOrigin, publicKey: hexToBytes(b.sessionKey as Hex), permissions: b.permissions, validUntil: new Date(validUntil * 1000) } });
    // enableSession toca un módulo → el worker lo co-firma con MPC (sin código: permisos acotados).
    await ctx.redis.lpush('jobs:enable-session', JSON.stringify({ sessionKeyId: row.id }));
    return reply.code(201).send({ id: row.id });
  });

  app.delete('/session-keys/:id', async (req) => {
    const { id } = req.params as { id: string };
    const s = await ctx.db.sessionKey.findFirst({ where: { id, account: { userId: req.user.sub } } });
    if (!s) throw httpError(404, 'sesión no encontrada');
    await ctx.db.sessionKey.update({ where: { id }, data: { status: 'revoked' } });
    // revokeSession es "solo endurece": la app puede firmarlo con passkey; el worker lo envía.
    await ctx.redis.lpush('jobs:revoke-session', JSON.stringify({ sessionKeyId: id }));
    return { ok: true };
  });
};
