import { describe, expect, it } from 'vitest';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { encodeCallData, encodeNonce, getUserOpHash, type UserOperation } from '@hw/sdk';
import { evaluateCosign, type CosignContext } from '../../src/modules/mpc-coordinator/cosign-policy';
import { issueStepUp } from '../../src/modules/stepup/token';

const EP = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as Address;
const ACC = '0x1111111111111111111111111111111111111111' as Address;
const WEBAUTHN = '0x2222222222222222222222222222222222222222' as Address;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const BOB = '0x000000000000000000000000000000000000b0b0' as Address;
const secret = Buffer.alloc(32, 7);

const op = (amount: bigint): UserOperation => ({
  sender: ACC, nonce: encodeNonce(WEBAUTHN, 1n), initCode: '0x',
  callData: encodeCallData([{ to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [BOB, amount] }) }]),
  callGasLimit: 1n, verificationGasLimit: 1n, preVerificationGas: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n,
  paymasterAndData: '0x', signature: '0x',
});

const used = new Set<string>();
const ctx = (): CosignContext => ({
  now: Math.floor(Date.now() / 1000), entryPoint: EP, stepUpSecret: secret,
  consumeJti: async (j) => (used.has(j) ? false : (used.add(j), true)),
  limits: new Map([[USDC, { amount: 200_000_000n, periodSeconds: 86400, spent: 0n, windowStart: 0 }]]),
  installedModules: new Set([WEBAUTHN.toLowerCase()]), knownRecipients: new Set([BOB.toLowerCase()]), signsLastHour: 0,
});

describe('evaluateCosign (T075)', () => {
  const big = op(250_000_000n);
  const hash = getUserOpHash(big, EP, 84532);
  const base = { userId: 'u1', account: ACC, chainId: 84532, userOp: big, messageHash: hash };

  it('niega sobre el límite sin segundo factor', async () => {
    expect(await evaluateCosign(base, ctx())).toEqual({ allow: false, reason: 'requiere segundo factor' });
  });
  it('acepta con stepUpToken ligado al hash', async () => {
    const t = issueStepUp(secret, { sub: 'u1', hash, factor: 'otp_email' });
    expect(await evaluateCosign({ ...base, stepUpToken: t }, ctx())).toEqual({ allow: true });
  });
  it('niega un token ligado a otro hash', async () => {
    const t = issueStepUp(secret, { sub: 'u1', hash: `0x${'ab'.repeat(32)}`, factor: 'otp_email' });
    expect((await evaluateCosign({ ...base, stepUpToken: t }, ctx())).allow).toBe(false);
  });
  it('niega reutilizar el mismo token', async () => {
    const c = ctx();
    const t = issueStepUp(secret, { sub: 'u1', hash, factor: 'otp_sms' });
    await evaluateCosign({ ...base, stepUpToken: t }, c);
    expect(await evaluateCosign({ ...base, stepUpToken: t }, c)).toEqual({ allow: false, reason: 'stepUpToken ya usado' });
  });
  it('niega si el messageHash no corresponde a la UserOp', async () => {
    expect((await evaluateCosign({ ...base, messageHash: `0x${'00'.repeat(32)}` }, ctx())).allow).toBe(false);
  });
});
