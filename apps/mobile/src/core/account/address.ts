import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, publicKeyToAddress, type Address } from 'viem';

/** PK MPC comprimida (33 bytes) → dirección del EOA. */
export function addressFromCompressed(pk: Uint8Array): Address {
  const uncompressed = secp256k1.ProjectivePoint.fromHex(pk).toRawBytes(false);
  return publicKeyToAddress(bytesToHex(uncompressed));
}
