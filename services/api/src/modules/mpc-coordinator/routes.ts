import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getAddress, bytesToHex, type Hex } from 'viem';
import type { AppContext } from '../../lib/context';
import { httpError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { evaluateCosign } from './cosign-policy';
import { fromJson } from './userop-json';

/**
 * /mpc/sessions: la API es un relay opaco hacia el enclave. Para "sign" decide ANTES si el
 * enclave participa (evaluateCosign). El enclave además verifica la aserción de passkey.
 * Sesiones en Redis con TTL 120 s (data-model MpcSession).
 */
const Open = z.object({
  purpose: z.enum(['dkg', 'sign', 'reshare']),
  accountId: z.string().uuid().optional(),
  messageHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  userOp: z.any().optional(),
  stepUpToken: z.string().optional(),
  passkeyAssertion: z.any().optional(),
  attestationNonce: z.string(),
});

export const mpcRoutes = (ctx: AppContext): FastifyPluginAsync => async (app) => {
  app.post('/mpc/sessions', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = Open.parse(req.body);
    const userId = req.user.sub;
    let authContext: Record<string, unknown> = { userId };

    if (body.purpose !== 'dkg') {
      const acc = await ctx.db.smartAccount.findFirst({ where: { id: body.accountId, userId }, include: { policies: true, shares: { where: { status: 'active', role: 'server' } } } });
      if (!acc) throw httpError(404, 'cuenta no encontrada');
      authContext = { ...authContext, accountId: acc.id, epoch: acc.shares[0]?.epoch, blobRef: acc.shares[0]?.enclaveBlobRef };

      if (body.purpose === 'sign') {
        if (!body.userOp || !body.messageHash || !body.passkeyAssertion) throw httpError(400, 'faltan userOp, messageHash o aserción');
        const account = getAddress(bytesToHex(acc.address));
        const decision = await evaluateCosign(
          { userId, account, chainId: Number(body.userOp.chainId ?? process.env.DEFAULT_CHAIN_ID ?? 84532), messageHash: body.messageHash as Hex, userOp: fromJson(body.userOp), stepUpToken: body.stepUpToken },
          {
            now: Math.floor(Date.now() / 1000), entryPoint: ctx.config.entryPoint, stepUpSecret: ctx.config.stepUpSecret,
            consumeJti: async (jti) => (await ctx.redis.set(`jti:${jti}`, '1', 'EX', 600, 'NX')) === 'OK',
            limits: new Map(acc.policies.map((p) => [getAddress(bytesToHex(p.token)), { amount: BigInt(p.limitAmount.toFixed()), periodSeconds: p.periodSeconds, spent: 0n, windowStart: 0 }])),
            installedModules: new Set(Object.values(ctx.config.modules).map((m) => m.toLowerCase())),
            knownRecipients: new Set((await ctx.redis.smembers(`recipients:${acc.id}`)).map((x) => x.toLowerCase())),
            signsLastHour: Number(await ctx.redis.incr(`cosigns:${acc.id}:${Math.floor(Date.now() / 3_600_000)}`)) - 1,
            adminNoticeGivenAt: Number(await ctx.redis.get(`admin-notice:${acc.id}`)) || undefined,
          },
        );
        if (!decision.allow) {
          logger.info({ accountId: acc.id, reason: decision.reason }, 'co-firma denegada');
          return reply.code(403).send({ error: decision.reason });
        }
        authContext = { ...authContext, messageHash: body.messageHash, passkeyAssertion: body.passkeyAssertion, coordinatorApproved: true };
      }
    }

    const { sessionId, firstMessage } = await ctx.enclave.openSession({
      purpose: body.purpose, accountId: body.accountId ?? '', messageHash: body.messageHash as Hex | undefined,
      authContext: JSON.stringify({ ...authContext, attestationNonce: body.attestationNonce }),
    });
    await ctx.redis.set(`mpc:${sessionId}`, JSON.stringify({ userId, purpose: body.purpose, round: 0 }), 'EX', 120);
    const attestation = await ctx.redis.get(`mpc:${sessionId}:attestation`);
    return reply.code(201).send({ sessionId, firstMessage, attestation });
  });

  app.post('/mpc/sessions/:id/rounds', async (req) => {
    const { id } = req.params as { id: string };
    const { round, payload } = z.object({ round: z.number().int().min(1).max(8), from: z.literal('D'), payload: z.string().optional() }).parse(req.body);
    const raw = await ctx.redis.get(`mpc:${id}`);
    if (!raw) throw httpError(410, 'sesión MPC vencida');
    const s = JSON.parse(raw) as { userId: string; round: number };
    if (s.userId !== req.user.sub) throw httpError(403, 'sesión de otro usuario');
    if (round !== s.round + 1) throw httpError(409, 'ronda fuera de orden');
    const res = await ctx.enclave.round(id, payload ?? '');
    await ctx.redis.set(`mpc:${id}`, JSON.stringify({ ...s, round }), 'KEEPTTL');
    return { payload: res.payload || undefined, done: res.done };
  });
};
