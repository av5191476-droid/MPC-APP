import { bytesToHex, concat, hexToBytes, pad, toHex, type Hex } from 'viem';
import { api } from '../api/client';
import type { UserOpJson } from '../api/types';
import { b64urlToBytes, bytesToB64url } from '../passkey/webauthn';
import { verifyEnclave } from './attestation';
import { Mpc, type DkgOutput, type Party } from './native';

/**
 * Orquestación D ↔ S (mpc-protocol.md). La API solo hace relay; los payloads ya van
 * cifrados E2E por el núcleo nativo con la llave de la attestation.
 */
type OpenResponse = { sessionId: string; attestation: string; firstMessage?: string };
type RoundResponse = { payload?: string; done: boolean };

const toBuf = (b64: string) => b64urlToBytes(b64).buffer as ArrayBuffer;
const fromBuf = (b: ArrayBuffer) => bytesToB64url(new Uint8Array(b));

async function open(body: Record<string, unknown>) {
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const res = await api<OpenResponse>('/mpc/sessions', { method: 'POST', body: { ...body, attestationNonce: bytesToB64url(nonce) } });
  const session = verifyEnclave(b64urlToBytes(res.attestation), nonce);
  return { res, session };
}

/** Ejecuta rondas hasta que ambos lados terminan. Un aborto no deja estado persistido. */
async function run(sessionId: string, party: Party<unknown>, first?: string) {
  let incoming = first ? toBuf(first) : undefined;
  for (let round = 1; round <= 8; round++) {
    const step = party.handle(incoming);
    if (step.done && !step.outgoing) return;
    const res = await api<RoundResponse>(`/mpc/sessions/${sessionId}/rounds`, {
      method: 'POST', body: { round, from: 'D', payload: step.outgoing ? fromBuf(step.outgoing) : undefined },
    });
    if (step.done && res.done) return;
    incoming = res.payload ? toBuf(res.payload) : undefined;
  }
  throw new Error('El protocolo MPC excedió las rondas esperadas.');
}

export async function dkg(): Promise<DkgOutput & { sessionId: string }> {
  const { res, session } = await open({ purpose: 'dkg' });
  const party = new Mpc.DkgParty(session);
  await run(res.sessionId, party, res.firstMessage);
  return { ...party.finish(), sessionId: res.sessionId };
}

export type CosignInput = {
  accountId: string; userOp: UserOpJson; messageHash: Hex;
  stepUpToken?: string;
  /** Aserción de passkey sobre messageHash: el enclave la verifica antes de participar. */
  passkeyAssertion: unknown;
  shareDevice: Uint8Array;
};

/** Firma ECDSA de 65 bytes (r ‖ s ‖ v) del EOA, producida por D + S. */
export async function cosign(i: CosignInput): Promise<Hex> {
  const { res, session } = await open({
    purpose: 'sign', accountId: i.accountId, userOp: i.userOp, messageHash: i.messageHash,
    stepUpToken: i.stepUpToken, passkeyAssertion: i.passkeyAssertion,
  });
  const party = new Mpc.SignParty(i.shareDevice.slice().buffer as ArrayBuffer, hexToBytes(i.messageHash).buffer as ArrayBuffer, session);
  await run(res.sessionId, party, res.firstMessage);
  return toRsv(party.signature());
}

export async function reshare(accountId: string, shareBackup: Uint8Array, epoch: number): Promise<DkgOutput> {
  const { res, session } = await open({ purpose: 'reshare', accountId });
  const party = new Mpc.ReshareParty(shareBackup.slice().buffer as ArrayBuffer, epoch, session);
  shareBackup.fill(0);
  await run(res.sessionId, party, res.firstMessage);
  return party.finish();
}

export function emergencySign(shareDevice: Uint8Array, shareBackup: Uint8Array, hash: Hex): Hex {
  try {
    return toRsv(Mpc.emergencySign(shareDevice.slice().buffer as ArrayBuffer, shareBackup.slice().buffer as ArrayBuffer, hexToBytes(hash).buffer as ArrayBuffer));
  } finally {
    shareDevice.fill(0); shareBackup.fill(0);
  }
}

function toRsv(sig: { r: ArrayBuffer; s: ArrayBuffer; v: number }): Hex {
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  return concat([pad(bytesToHex(new Uint8Array(sig.r)), { size: 32 }), pad(bytesToHex(new Uint8Array(sig.s)), { size: 32 }), toHex(v, { size: 1 })]);
}
