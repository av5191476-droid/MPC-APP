export const AUTH = { SESSION: 0, PASSKEY: 1, MPC: 2, COMPOSITE: 3, RECOVERY: 4 } as const;
export type AuthLevel = (typeof AUTH)[keyof typeof AUTH];

/** Prefijos de firma de HybridAccount. */
export const SIG = { SINGLE: '0x00', COMPOSITE: '0x01' } as const;

/** Modo ERC-7579: el primer byte es el callType. */
export const MODE = {
  SINGLE: `0x${'00'.repeat(32)}`,
  BATCH: `0x01${'00'.repeat(31)}`,
} as const;

export const SELECTORS = {
  transfer: '0xa9059cbb',
  transferFrom: '0x23b872dd',
  approve: '0x095ea7b3',
  increaseAllowance: '0x39509351',
} as const;
