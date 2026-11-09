import { decode } from 'cbor-x';
import Constants from 'expo-constants';
import { bytesToHex } from 'viem';
import { Mpc, type EnclaveSession } from './native';

/**
 * T025: antes de la ronda 1 la app verifica el documento de attestation de AWS Nitro.
 *  1. Firma COSE_Sign1 y cadena de certificados → en Rust (verifyAttestationSignature).
 *  2. PCR0 == binario reproducible publicado por CI, nonce == el nuestro, documento fresco → aquí.
 * Si algo falla no se envía ningún mensaje MPC.
 */
const EXPECTED_PCR0: string = (Constants.expoConfig?.extra?.expectedPcr0 ?? '').toLowerCase();
const MAX_AGE_MS = 5 * 60_000;

export class AttestationError extends Error {}

type NitroPayload = { pcrs: Map<number, Uint8Array> | Record<number, Uint8Array>; nonce?: Uint8Array; timestamp: number; public_key?: Uint8Array };

export function checkPayload(doc: Uint8Array, nonce: Uint8Array, now = Date.now(), expectedPcr0 = EXPECTED_PCR0): NitroPayload {
  if (!expectedPcr0) throw new AttestationError('Este build no tiene PCR0 esperado configurado.');
  const cose = decode(doc) as unknown[];
  const raw = Array.isArray(cose) ? cose : ((cose as { value: unknown[] }).value);
  const payload = decode(raw[2] as Uint8Array) as NitroPayload;
  const pcrs = payload.pcrs instanceof Map ? payload.pcrs : new Map(Object.entries(payload.pcrs).map(([k, v]) => [Number(k), v]));
  const pcr0 = pcrs.get(0);
  if (!pcr0 || bytesToHex(pcr0).slice(2).toLowerCase() !== expectedPcr0.replace(/^0x/, '')) throw new AttestationError('PCR0 no coincide con el binario publicado.');
  if (!payload.nonce || bytesToHex(payload.nonce) !== bytesToHex(nonce)) throw new AttestationError('Nonce distinto: posible repetición.');
  if (Math.abs(now - payload.timestamp) > MAX_AGE_MS) throw new AttestationError('Documento de attestation vencido.');
  return payload;
}

export function verifyEnclave(doc: Uint8Array, nonce: Uint8Array): EnclaveSession {
  checkPayload(doc, nonce);
  return Mpc.verifyAttestationSignature(doc.buffer as ArrayBuffer);
}
