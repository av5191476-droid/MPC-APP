/**
 * Tipos del Turbo Module que genera uniffi-bindgen-react-native desde native/mpc (npm run mpc:build).
 * Este archivo fija el contrato; el import real apunta al paquete generado "hw-mpc".
 */
// eslint-disable-next-line import/no-unresolved
import * as Generated from 'hw-mpc';

export type EnclaveSession = { enclavePublicKey: ArrayBuffer; pcr0: ArrayBuffer };
export type Step = { outgoing?: ArrayBuffer; done: boolean };
export type DkgOutput = { publicKey: ArrayBuffer; shareDevice: ArrayBuffer; shareBackup: ArrayBuffer; epoch: number };
export type Signature = { r: ArrayBuffer; s: ArrayBuffer; v: number };

export interface Party<R> { handle(incoming?: ArrayBuffer): Step; finish?(): R; signature?(): Signature }

export type NativeMpc = {
  verifyAttestationSignature(doc: ArrayBuffer): EnclaveSession;
  DkgParty: new (s: EnclaveSession) => Party<DkgOutput> & { finish(): DkgOutput };
  SignParty: new (shareDevice: ArrayBuffer, messageHash: ArrayBuffer, s: EnclaveSession) => Party<never> & { signature(): Signature };
  ReshareParty: new (shareBackup: ArrayBuffer, epoch: number, s: EnclaveSession) => Party<DkgOutput> & { finish(): DkgOutput };
  emergencySign(shareDevice: ArrayBuffer, shareBackup: ArrayBuffer, messageHash: ArrayBuffer): Signature;
};

export const Mpc = Generated as unknown as NativeMpc;
