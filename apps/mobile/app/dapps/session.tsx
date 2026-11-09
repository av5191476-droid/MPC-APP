import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Address } from 'viem';
import { Button, Notice, Row, Screen, Title } from '@/ui/primitives';
import { approveProposal, describePermission, rejectProposal, type SessionPermission } from '@/features/dapps/walletkit';
import { defaultChainId, chainById } from '@/core/chains';
import { usePendingProposal } from '@/features/dapps/proposals';

/** US5-AS1: permisos legibles antes de instalar la session key. */
export default function SessionRequest() {
  const { t } = useTranslation();
  const { target, max = '10', hours = '1' } = useLocalSearchParams<{ target: Address; max?: string; hours?: string }>();
  const proposal = usePendingProposal();
  const [busy, setBusy] = useState(false);
  if (!proposal) return null;

  const name = proposal.params.proposer.metadata.name;
  const perm: SessionPermission = {
    target, selector: '0xa9059cbb', token: chainById(defaultChainId)!.usdc as Address,
    maxAmount: BigInt(Math.round(Number(max) * 1e6)), validUntil: Math.floor(Date.now() / 1000) + Number(hours) * 3600,
  };
  const d = describePermission(perm, 'USDC', name);

  return (
    <Screen footer={<>
      <Button label={t('dapps.approve')} loading={busy} onPress={async () => { setBusy(true); try { await approveProposal(proposal, [perm], [defaultChainId]); router.back(); } finally { setBusy(false); } }} />
      <Button variant="link" label="Rechazar" onPress={() => rejectProposal(proposal.id).then(() => router.back())} />
    </>}>
      <Title sub={proposal.params.proposer.metadata.url}>{t('dapps.request', { name })}</Title>
      <Notice title="Lo que podrá hacer">{t('dapps.permission', d)}</Notice>
      <Row label="Gasto máximo" value={`${d.amount} USDC`} />
      <Row label="Vigencia" value={d.duration} />
      <Row label="Puede revocarse" value="Sí, en Conexiones" />
      <Notice tone="warn">Fuera de estos límites el contrato rechaza cualquier pago, aunque la app lo intente.</Notice>
    </Screen>
  );
}
