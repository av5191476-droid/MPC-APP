import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, keccak256, parseSignature, serializeTransaction, type Address, type Chain } from 'viem';
import { toAccount } from 'viem/accounts';
import { base, baseSepolia, arbitrum, polygon } from 'viem/chains';
import { openShareB } from '@/core/backup/backupKey';
import { downloadEnvelope } from '@/core/backup/cloud';
import { emergencySign } from '@/core/mpc/session';
import { loadDeviceShare } from '@/core/secure/deviceShare';
import { keyForEnvelope } from '@/features/onboarding/uploadBackup';
import { useWallet } from '@/state/wallet';

/**
 * FR-019 "Salida de emergencia": NO toca nuestro backend. Usa RPC público, la parte del
 * teléfono y la del respaldo, y envía una transacción normal desde el EOA (sin bundler).
 * Requiere un poco de ETH/POL para gas: la guía pública explica cómo conseguirlo.
 */
const CHAINS: Record<number, Chain> = { [base.id]: base, [baseSepolia.id]: baseSepolia, [arbitrum.id]: arbitrum, [polygon.id]: polygon };

export async function emergencyExit(chainId: number, token: Address, to: Address, password?: string) {
  const acc = useWallet.getState().account!;
  const chain = CHAINS[chainId];
  if (!chain) throw new Error('Red no soportada.');
  const transport = http(); // RPC público de viem; configurable por el usuario en la guía

  const env = await downloadEnvelope(acc.address);
  if (!env) throw new Error('No encontramos tu respaldo en la nube.');

  const signer = toAccount({
    address: acc.address,
    async signMessage() { throw new Error('No disponible en emergencia'); },
    async signTypedData() { throw new Error('No disponible en emergencia'); },
    async signTransaction(tx) {
      const hash = keccak256(serializeTransaction(tx));
      const key = await keyForEnvelope(env, password);
      let shareB: Uint8Array;
      try { shareB = openShareB(key, env); } finally { key.fill(0); }
      const shareD = await loadDeviceShare(acc.address, acc.epoch);
      if (!shareD) { shareB.fill(0); throw new Error('Este teléfono no tiene su parte. Usa la recuperación.'); }
      const sig = emergencySign(shareD, shareB, hash); // borra ambas partes
      return serializeTransaction(tx, parseSignature(sig));
    },
  });

  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account: signer, chain, transport });
  const balance = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [acc.address] });
  if (balance === 0n) throw new Error('No hay saldo de ese token en esta red.');
  return wallet.sendTransaction({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, balance] }) });
}
