import { describe, expect, it } from 'vitest';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { encodeNonce, validatorOf, compositeSignature, requiresStepUp, spendsOf } from '../src';

const ACC = '0x1111111111111111111111111111111111111111' as Address;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const BOB = '0x000000000000000000000000000000000000b0b0' as Address;

describe('nonce', () => {
  it('codifica el validador en los 20 bytes altos', () => {
    const v = '0x00000000000000000000000000000000000a11ce' as Address;
    expect(validatorOf(encodeNonce(v, 7n)).toLowerCase()).toBe(v);
    expect(encodeNonce(null, 3n)).toBe(3n);
  });
});

describe('firma compuesta', () => {
  it('rechaza firmas MPC que no son de 65 bytes', () => {
    expect(() => compositeSignature('0x01', '0x1234')).toThrow();
  });
});

describe('política', () => {
  const limits = new Map([[USDC, { amount: 200_000_000n, periodSeconds: 86400, spent: 150_000_000n, windowStart: 0 }]]);
  const call = (amt: bigint) => ({ to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [BOB, amt] }) });

  it('bajo el límite no pide segundo factor', () => {
    expect(requiresStepUp(spendsOf([call(40_000_000n)], ACC), limits, 100)).toBe(false);
  });
  it('sobre el límite pide segundo factor', () => {
    expect(requiresStepUp(spendsOf([call(60_000_000n)], ACC), limits, 100)).toBe(true);
  });
  it('approve ilimitado siempre pide segundo factor', () => {
    const approve = { to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [BOB, 2n ** 256n - 1n] }) };
    expect(requiresStepUp(spendsOf([approve], ACC), limits, 100)).toBe(true);
  });
  it('la ventana se reinicia tras el periodo', () => {
    expect(requiresStepUp(spendsOf([call(190_000_000n)], ACC), limits, 86_400)).toBe(false);
  });
});
