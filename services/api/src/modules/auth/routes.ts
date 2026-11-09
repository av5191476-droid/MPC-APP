import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { decode, encode } from 'cbor-x';
import type { AppContext } from '../../lib/context';
import { httpError } from '../../lib/errors';

/** FR-001 / FR-024 / T017-T018. Challenges en Redis, de un solo uso, 2 min. */
const CHALLENGE_TTL = 120;
const REFRESH_DAYS = 30;
const sha = (s: string) => createHash('sha256').update(s).digest();

export const authRoutes = (ctx: AppContext): FastifyPluginAsync => async (app) => {
  const issue = async (userId: string, family = randomUUID()) => {
    const refreshToken = randomBytes(32).toString('base64url');
    await ctx.db.refreshToken.create({ data: { userId, family, hash: sha(refreshToken), expiresAt: new Date(Date.now() + REFRESH_DAYS * 86_400_000) } });
    return { accessToken: app.jwt.sign({ sub: userId }, { expiresIn: '15m' }), refreshToken, userId };
  };

  const takeChallenge = async (key: string) => {
    const v = await ctx.redis.getdel(`chal:${key}`);
    if (!v) throw httpError(400, 'challenge vencido o ya usado');
    return v;
  };

  app.post('/auth/register/options', async () => {
    const tempId = randomUUID();
    const options = await generateRegistrationOptions({
      rpName: 'Billetera', rpID: ctx.config.rpId, userName: `cuenta-${tempId.slice(0, 8)}`, userID: Buffer.from(tempId),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      supportedAlgorithmIDs: [-7], // ES256 (P-256): lo único que valida WebAuthnValidator
    });
    await ctx.redis.set(`chal:reg:${options.challenge}`, tempId, 'EX', CHALLENGE_TTL);
    return { ...options, extensions: { prf: {} } };
  });

  app.post('/auth/register/verify', async (req, reply) => {
    const body = req.body as { response: { clientDataJSON: string }; clientExtensionResults?: { prf?: { enabled?: boolean } } } & Record<string, unknown>;
    const challenge = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64url').toString()).challenge as string;
    await takeChallenge(`reg:${challenge}`);
    const v = await verifyRegistrationResponse({
      response: body as never, expectedChallenge: challenge, expectedOrigin: ctx.config.origin, expectedRPID: ctx.config.rpId, requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo) return reply.code(400).send({ error: 'registro inválido' });
    const { credential, credentialBackedUp } = v.registrationInfo;
    const { x, y } = coseToXY(credential.publicKey);
    const prfSupported = !!body.clientExtensionResults?.prf?.enabled;
    const user = await ctx.db.user.create({
      data: { passkeys: { create: { credentialId: Buffer.from(credential.id, 'base64url'), publicKeyX: x, publicKeyY: y, signCount: BigInt(credential.counter), transports: credential.transports ?? [], backedUp: credentialBackedUp, prfSupported } } },
    });
    return reply.code(201).send({ ...(await issue(user.id)), prfSupported });
  });

  app.post('/auth/login/options', async () => {
    const options = await generateAuthenticationOptions({ rpID: ctx.config.rpId, userVerification: 'required' });
    await ctx.redis.set(`chal:auth:${options.challenge}`, '1', 'EX', CHALLENGE_TTL);
    return options;
  });

  app.post('/auth/login/verify', async (req, reply) => {
    const body = req.body as { id: string; response: { clientDataJSON: string } };
    const challenge = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64url').toString()).challenge as string;
    await takeChallenge(`auth:${challenge}`);
    const pk = await ctx.db.passkey.findUnique({ where: { credentialId: Buffer.from(body.id, 'base64url') } });
    if (!pk || pk.status !== 'active') return reply.code(401).send({ error: 'llave desconocida' });
    const v = await verifyAuthenticationResponse({
      response: body as never, expectedChallenge: challenge, expectedOrigin: ctx.config.origin, expectedRPID: ctx.config.rpId, requireUserVerification: true,
      credential: { id: body.id, publicKey: xyToCose(pk.publicKeyX, pk.publicKeyY), counter: Number(pk.signCount) },
    });
    if (!v.verified) return reply.code(401).send({ error: 'aserción inválida' });
    await ctx.db.passkey.update({ where: { id: pk.id }, data: { signCount: BigInt(v.authenticationInfo.newCounter) } });
    return issue(pk.userId);
  });

  /** Refresh rotativo: reutilizar un token ya usado revoca toda la familia (robo detectado). */
  app.post('/auth/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const row = await ctx.db.refreshToken.findUnique({ where: { hash: sha(refreshToken) } });
    if (!row || row.expiresAt < new Date()) return reply.code(401).send({ error: 'sesión vencida' });
    if (row.usedAt) {
      await ctx.db.refreshToken.deleteMany({ where: { family: row.family } });
      await ctx.notify(row.userId, { title: 'Cerramos tus sesiones', body: 'Detectamos un uso extraño de tu sesión. Entra de nuevo con tu llave de acceso.', channels: ['push', 'email'] });
      return reply.code(401).send({ error: 'sesión revocada' });
    }
    await ctx.db.refreshToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return issue(row.userId, row.family);
  });
};

// COSE EC2 (P-256): -2 = x, -3 = y. Solo se aceptan llaves ES256.
function coseToXY(cose: Uint8Array) {
  const m = decode(cose) as Map<number, unknown> | Record<string, unknown>;
  const get = (k: number) => (m instanceof Map ? m.get(k) : (m as Record<string, unknown>)[k]);
  if (get(3) !== -7) throw new Error('solo ES256');
  return { x: Buffer.from(get(-2) as Uint8Array), y: Buffer.from(get(-3) as Uint8Array) };
}
function xyToCose(x: Uint8Array, y: Uint8Array) {
  return new Uint8Array(encode(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]])));
}
