import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Hex } from 'viem';
import type { AppContext } from '../../lib/context';
import { httpError } from '../../lib/errors';
import { issueStepUp } from './token';

/**
 * FR-014 / T078. OTP de 6 dígitos, 5 min, máx. 5 intentos, ligado a un messageHash.
 * SMS es el último recurso (T6, SIM swap): se prefiere email o segunda passkey.
 */
export const stepUpRoutes = (ctx: AppContext): FastifyPluginAsync => async (app) => {
  app.post('/stepup/challenge', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const { messageHash, channel } = z.object({ messageHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), channel: z.enum(['email', 'sms', 'passkey2']) }).parse(req.body);
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const dest = channel === 'email' ? user.email : channel === 'sms' ? user.phone : null;
    if (channel !== 'passkey2' && !dest) throw httpError(400, `no hay ${channel === 'email' ? 'correo' : 'teléfono'} verificado`);

    const challengeId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await ctx.redis.set(`stepup:${challengeId}`, JSON.stringify({ userId: user.id, messageHash, code, channel, attempts: 0 }), 'EX', 300);
    if (channel !== 'passkey2') {
      await ctx.notify(user.id, { title: 'Tu código de confirmación', body: `${code}. No lo compartas con nadie. Vence en 5 minutos.`, channels: [channel] });
    }
    return { challengeId, destination: mask(dest ?? 'otra llave de acceso') };
  });

  app.post('/stepup/verify', async (req) => {
    const { challengeId, code } = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const raw = await ctx.redis.get(`stepup:${challengeId}`);
    if (!raw) throw httpError(410, 'el código venció');
    const c = JSON.parse(raw) as { userId: string; messageHash: Hex; code: string; channel: 'email' | 'sms'; attempts: number };
    if (c.userId !== req.user.sub) throw httpError(403, 'código de otro usuario');
    if (!timingSafeEqual(Buffer.from(code), Buffer.from(c.code))) {
      if (++c.attempts >= 5) await ctx.redis.del(`stepup:${challengeId}`);
      else await ctx.redis.set(`stepup:${challengeId}`, JSON.stringify(c), 'KEEPTTL');
      throw httpError(400, 'code mismatch');
    }
    await ctx.redis.del(`stepup:${challengeId}`);
    return { stepUpToken: issueStepUp(ctx.config.stepUpSecret, { sub: c.userId, hash: c.messageHash, factor: c.channel === 'sms' ? 'otp_sms' : 'otp_email' }) };
  });
};

function mask(d: string) {
  if (d.includes('@')) { const [u, h] = d.split('@'); return `${u![0]}•••@${h}`; }
  return d.length > 4 ? `•••${d.slice(-4)}` : d;
}
