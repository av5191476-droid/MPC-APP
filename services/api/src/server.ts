import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { REDACT_PATHS } from './lib/logger';
import type { AppContext } from './lib/context';
import { authRoutes } from './modules/auth/routes';
import { accountRoutes } from './modules/accounts/routes';
import { mpcRoutes } from './modules/mpc-coordinator/routes';
import { stepUpRoutes } from './modules/stepup/routes';
import { userOpRoutes, userOpSubmitRoutes, type UserOpDeps } from './modules/userops/routes';
import { policyRoutes } from './modules/policies/routes';
import { recoveryRoutes } from './modules/recovery/routes';
import { activityRoutes } from './modules/activity/routes';

declare module '@fastify/jwt' { interface FastifyJWT { user: { sub: string } } }

/** Rutas públicas: alta, login, refresh e inicio/consulta de recuperación por guardianes. */
const PUBLIC = [/^\/v1\/auth\//, /^\/v1\/recovery(\/[^/]+)?$/];

export async function buildServer(ctx: AppContext, deps: UserOpDeps) {
  const app = Fastify({ logger: { redact: { paths: REDACT_PATHS, censor: '[redactado]' } }, bodyLimit: 256 * 1024 });

  await app.register(rateLimit, { redis: ctx.redis, max: 120, timeWindow: '1 minute', keyGenerator: (r) => (r.user?.sub ?? r.ip) });
  await app.register(jwt, { secret: ctx.config.jwtSecret });

  app.addHook('onRequest', async (req, reply) => {
    const isPublic = PUBLIC.some((p) => p.test(req.url.split('?')[0]!));
    try { await req.jwtVerify(); } catch { if (!isPublic) return reply.code(401).send({ error: 'sesión inválida' }); }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'datos inválidos', issues: err.issues.map((i) => i.path.join('.')) });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error({ err }, 'error interno');
    return reply.code(status).send({ error: status >= 500 ? 'error interno' : err.message });
  });

  await app.register(async (v1) => {
    await v1.register(authRoutes(ctx));
    await v1.register(accountRoutes(ctx));
    await v1.register(mpcRoutes(ctx));
    await v1.register(stepUpRoutes(ctx));
    await v1.register(userOpRoutes(deps));
    await v1.register(userOpSubmitRoutes({ ...deps, db: ctx.db }));
    await v1.register(policyRoutes(ctx, async (_id, chainId, op) => ({ ...op, ...(await deps.bundler.estimate(op, chainId)) })));
    await v1.register(recoveryRoutes(ctx));
    await v1.register(activityRoutes(ctx));
  }, { prefix: '/v1' });

  app.get('/health', async () => ({ ok: true }));
  return app;
}
