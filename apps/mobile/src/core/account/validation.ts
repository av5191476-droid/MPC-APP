import { isAddress, type Address } from 'viem';

export type RecipientError = 'address' | 'tokenContract' | 'self';

/** US2-AS3 y casos borde: formato, contrato del token y la propia cuenta. */
export function validateRecipient(to: string, self: Address, tokenContracts: string[]): RecipientError | null {
  const t = to.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(t) || !isAddress(t, { strict: false })) return 'address';
  if (tokenContracts.some((c) => c.toLowerCase() === t.toLowerCase())) return 'tokenContract';
  if (t.toLowerCase() === self.toLowerCase()) return 'self';
  return null;
}
