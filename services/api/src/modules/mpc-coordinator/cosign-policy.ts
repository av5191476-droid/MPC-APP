import { getUserOpHash, requiresStepUp, spendsOf, validatorOf, type LimitState, type UserOperation } from '@hw/sdk';
import { decodeAbiParameters, hexToBigInt, slice, type Address, type Hex } from 'viem';
import { readStepUp } from '../stepup/token';

/**
 * Puerta del servidor antes de liberar su ronda MPC (mpc-protocol §2, FR-014, CHK015).
 * El servidor puede NEGARSE a co-firmar; nunca puede firmar solo (Constitución I).
 * Función pura: toda la E/S (Redis, BD, reloj) entra por `ctx`.
 */
export type CosignRequest = {
  userId: string;
  account: Address;
  chainId: number;
  messageHash: Hex;
  userOp: UserOperation;
  stepUpToken?: string;
};

export type CosignContext = {
  now: number; // segundos
  entryPoint: Address;
  stepUpSecret: Buffer;
  consumeJti(jti: string): Promise<boolean>; // false si ya se usó
  limits: Map<Address, LimitState>;
  installedModules: Set<string>; // direcciones en minúscula
  knownRecipients: Set<string>;
  signsLastHour: number;
  adminNoticeGivenAt?: number; // aviso público de cambio admin peligroso
};

export type CosignDecision = { allow: true } | { allow: false; reason: string };

const ADMIN_NOTICE_SECONDS = 48 * 3600;
const MAX_SIGNS_PER_HOUR = 10;
const NEW_RECIPIENT_STEPUP = 50_000_000n; // 50 USDC

export async function evaluateCosign(req: CosignRequest, ctx: CosignContext): Promise<CosignDecision> {
  // 1. El hash que firma el enclave es el que el propio servidor recalcula. Nunca uno ciego.
  if (req.userOp.sender.toLowerCase() !== req.account.toLowerCase()) return deny('sender distinto a la cuenta');
  const recomputed = getUserOpHash(req.userOp, ctx.entryPoint, req.chainId);
  if (recomputed !== req.messageHash) return deny('messageHash no coincide con la UserOp');

  // 2. Antifraude básico (T079).
  if (ctx.signsLastHour >= MAX_SIGNS_PER_HOUR) return deny('velocidad: demasiadas co-firmas en 1 h');

  const calls = decodeCalls(req.userOp);
  const spends = spendsOf(calls, req.account);
  const touchesAdmin = calls.some((c) => c.to.toLowerCase() === req.account.toLowerCase() || ctx.installedModules.has(c.to.toLowerCase()));
  const newRecipient = spends.some((s) => !ctx.knownRecipients.has(s.to.toLowerCase()) && s.amount >= NEW_RECIPIENT_STEPUP);
  const overLimit = requiresStepUp(spends, ctx.limits, ctx.now);

  // 3. Cambios de administración: el contrato no puede frenar a la llave raíz (research R1),
  //    así que el timelock de 48 h lo hace cumplir el servidor negándose a co-firmar antes de tiempo.
  if (touchesAdmin && validatorOf(req.userOp.nonce) === '0x0000000000000000000000000000000000000000') {
    if (!ctx.adminNoticeGivenAt || ctx.now - ctx.adminNoticeGivenAt < ADMIN_NOTICE_SECONDS) {
      return deny('cambio administrativo sin aviso previo de 48 h');
    }
  }

  // 4. Segundo factor ligado a ESTE hash.
  if (overLimit || newRecipient || touchesAdmin) {
    if (!req.stepUpToken) return deny('requiere segundo factor');
    const claims = readStepUp(ctx.stepUpSecret, req.stepUpToken);
    if (!claims) return deny('stepUpToken inválido');
    if (claims.sub !== req.userId) return deny('stepUpToken de otro usuario');
    if (claims.hash !== req.messageHash) return deny('stepUpToken ligado a otro hash');
    if (claims.exp < ctx.now) return deny('stepUpToken vencido');
    if (!(await ctx.consumeJti(claims.jti))) return deny('stepUpToken ya usado');
  }
  return { allow: true };
}

const deny = (reason: string): CosignDecision => ({ allow: false, reason });

// Decodificación mínima del callData executeUserOp(modo, ejecución) → llamadas.
function decodeCalls(op: UserOperation): { to: Address; value: bigint; data: Hex }[] {
  const [mode, exec] = decodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes' }], slice(op.callData, 4));
  if (mode.slice(2, 4) === '00') {
    return [{ to: slice(exec, 0, 20) as Address, value: hexToBigInt(slice(exec, 20, 52)), data: exec.length > 106 ? slice(exec, 52) : '0x' }];
  }
  const [arr] = decodeAbiParameters([{ type: 'tuple[]', components: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }] }], exec);
  return arr.map(([to, value, data]) => ({ to, value, data }));
}
