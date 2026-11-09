import { concat, encodeAbiParameters, hexToBigInt, pad, toHex, type Hex } from 'viem';
import { SIG } from './constants';

/** Orden de campos de OZ WebAuthn.WebAuthnAuth (verificar al fijar la versión de OZ). */
export type WebAuthnAuth = {
  r: Hex; s: Hex; challengeIndex: bigint; typeIndex: bigint;
  authenticatorData: Hex; clientDataJSON: string;
};

const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/** Las plataformas pueden devolver `s` alto; el contrato lo rechaza (anti-maleabilidad). */
export function normalizeS(s: Hex): Hex {
  const v = hexToBigInt(s);
  return pad(toHex(v > P256_N / 2n ? P256_N - v : v), { size: 32 });
}

export function encodeWebAuthn(credIdHash: Hex, auth: WebAuthnAuth): Hex {
  return encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'tuple', components: [
        { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' },
        { name: 'challengeIndex', type: 'uint256' }, { name: 'typeIndex', type: 'uint256' },
        { name: 'authenticatorData', type: 'bytes' }, { name: 'clientDataJSON', type: 'string' },
      ] },
    ],
    [credIdHash, { ...auth, s: normalizeS(auth.s) }],
  );
}

/** Uso diario: solo passkey. */
export const passkeySignature = (moduleSig: Hex): Hex => concat([SIG.SINGLE, moduleSig]);

/** Sobre el límite: passkey + co-firma MPC (ECDSA 65 bytes del EOA). */
export function compositeSignature(moduleSig: Hex, mpcSig: Hex): Hex {
  if ((mpcSig.length - 2) / 2 !== 65) throw new Error('la firma MPC debe tener 65 bytes');
  return concat([SIG.COMPOSITE, encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [moduleSig, mpcSig])]);
}
