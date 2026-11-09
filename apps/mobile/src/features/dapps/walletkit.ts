import { Core } from '@walletconnect/core';
import { WalletKit, type WalletKitTypes } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import * as SecureStore from 'expo-secure-store';
import type { Address } from 'viem';
import { api } from '@/core/api/client';
import { useWallet } from '@/state/wallet';

/** FR-020/021: WalletConnect + session keys acotadas. */
let kit: Awaited<ReturnType<typeof WalletKit.init>> | null = null;

export async function initWalletKit(projectId: string) {
  kit ??= await WalletKit.init({
    core: new Core({ projectId }),
    metadata: { name: 'Billetera', description: 'Billetera no custodial', url: 'https://wallet.example.com', icons: [] },
  });
  return kit;
}

export type SessionPermission = { target: Address; selector: `0x${string}`; token: Address; maxAmount: bigint; validUntil: number };

/** Texto legible para la pantalla de permisos (US5-AS1). */
export const describePermission = (p: SessionPermission, tokenSymbol: string, targetName: string) =>
  ({ amount: (Number(p.maxAmount) / 1e6).toString(), token: tokenSymbol, target: targetName, duration: `${Math.round((p.validUntil * 1000 - Date.now()) / 3_600_000)} h` });

/**
 * Crea la session key (secp256k1, en el llavero, sin biometría: firma sola dentro de sus límites),
 * prepara la instalación on-chain (requiere co-firma MPC sin código) y aprueba la sesión WC.
 */
export async function approveProposal(p: WalletKitTypes.SessionProposal, perms: SessionPermission[], chainIds: number[]) {
  const account = useWallet.getState().account!;
  const pk = generatePrivateKey();
  const sessionKey = privateKeyToAddress(pk);
  await SecureStore.setItemAsync(`hw.session.${sessionKey}`, pk, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });

  await api('/session-keys', { method: 'POST', body: { accountId: account.id, sessionKey, dappOrigin: p.params.proposer.metadata.url, permissions: perms.map((x) => ({ ...x, maxAmount: x.maxAmount.toString() })) } });

  const namespaces = buildApprovedNamespaces({
    proposal: p.params,
    supportedNamespaces: {
      eip155: {
        chains: chainIds.map((id) => `eip155:${id}`),
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'wallet_sendCalls', 'wallet_getCallsStatus', 'wallet_getCapabilities'],
        events: ['accountsChanged', 'chainChanged'],
        accounts: chainIds.map((id) => `eip155:${id}:${account.address}`),
      },
    },
  });
  return kit!.approveSession({ id: p.id, namespaces });
}

export const rejectProposal = (id: number) => kit!.rejectSession({ id, reason: getSdkError('USER_REJECTED') });
