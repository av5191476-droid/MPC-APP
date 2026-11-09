import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hexToBytes, type Hex } from 'viem';
import type { AppContext } from '../../lib/context';
import { httpError } from '../../lib/errors';

/**
 * FR-017/018, T092. Máquina de estados de data-model.md:
 * initiated → verifying → (reshare_backup) executed
 *                      ↘ (guardians) timelocked → executed | cancelled
 * Cada transición avisa al titular por todos los canales (US4-AS4).
 */
export const recoveryRoutes = (ctx: AppContext): FastifyPluginAsync => async (app) => {
  app.post('/recovery', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (req, reply) => {
    const b = z.object({ method: z.enum(['reshare_backup', 'guardians', 'sweep']), accountAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/), deviceAttestation: z.any().optional() }).parse(req.body);
    const acc = await ctx.db.smartAccount.findUnique({ where: { address: hexToBytes(b.accountAddress as Hex) } });
    if (!acc) throw httpError(404, 'cuenta no encontrada');
    if (b.method === 'reshare_backup' && acc.userId !== (req.user as { sub?: string } | undefined)?.sub) throw httpError(403, 'entra primero con tu llave de acceso');

    const r = await ctx.db.recoveryRequest.create({
      data: {
        accountId: acc.id, method: b.method, status: b.method === 'reshare_backup' ? 'verifying' : 'initiated',
        newDeviceAttestation: b.deviceAttestation ?? undefined,
        timelockEndsAt: b.method === 'reshare_backup' ? null : new Date(Date.now() + 72 * 3_600_000),
      },
    });
    await ctx.db.user.update({ where: { id: acc.userId }, data: { status: 'recovering' } });
    await ctx.notify(acc.userId, {
      title: 'Alguien está recuperando tu billetera',
      body: b.method === 'reshare_backup' ? 'Si no fuiste tú, cambia la contraseña de tu cuenta de iCloud o Google ahora.' : 'Tienes 72 horas para cancelarlo desde Seguridad si no fuiste tú.',
      screen: 'security', channels: ['push', 'email', 'sms'],
    });
    if (b.method === 'guardians') await ctx.redis.lpush('jobs:notify-guardians', JSON.stringify({ recoveryId: r.id }));
    return reply.code(202).send(dto(r));
  });

  app.get('/recovery/:id', async (req) => {
    const r = await ctx.db.recoveryRequest.findUnique({ where: { id: (req.params as { id: string }).id } });
    if (!r) throw httpError(404, 'solicitud no encontrada');
    return dto(r);
  });

  app.delete('/recovery/:id', async (req, reply) => {
    const r = await ctx.db.recoveryRequest.findUnique({ where: { id: (req.params as { id: string }).id }, include: { account: true } });
    if (!r || r.account.userId !== req.user.sub) throw httpError(404, 'solicitud no encontrada');
    if (!['initiated', 'verifying', 'timelocked'].includes(r.status)) throw httpError(409, 'ya no se puede cancelar');
    await ctx.db.recoveryRequest.update({ where: { id: r.id }, data: { status: 'cancelled', closedAt: new Date() } });
    // On-chain: GuardianRecovery.cancel() con passkey sola (selector que solo endurece).
    return reply.code(204).send();
  });
};

const dto = (r: { id: string; method: string; status: string; timelockEndsAt: Date | null; newAddress: Uint8Array | null }) => ({
  id: r.id, method: r.method, status: r.status,
  timelockEndsAt: r.timelockEndsAt ? Math.floor(r.timelockEndsAt.getTime() / 1000) : undefined,
  newAddress: r.newAddress ? `0x${Buffer.from(r.newAddress).toString('hex')}` : undefined,
});
