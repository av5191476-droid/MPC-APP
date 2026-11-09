import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Notice, Row, Screen, Title } from '@/ui/primitives';
import { chainById } from '@/core/chains';
import { formatCop, formatUsdc, parseAmount, shortAddress } from '@/core/format';
import { execute, requestStepUp } from '@/features/send/sendFlow';
import { useSend } from '@/features/send/store';

export default function Review() {
  const { t } = useTranslation();
  const send = useSend();
  const [busy, setBusy] = useState(false);
  const prep = send.prep!;
  const amount = parseAmount(send.amountText) ?? 0n;
  const usd = Number(amount) / 1e6;
  const chain = chainById(send.chainId)!;

  const confirm = async () => {
    setBusy(true);
    try {
      if (prep.requiresStepUp) {
        const ch = await requestStepUp(prep.userOpHash);
        send.set({ challenge: { id: ch.challengeId, destination: ch.destination } });
        router.push({ pathname: '/send/stepup', params: { purpose: 'send' } });
        return;
      }
      const hash = await execute(prep, send.chainId, () => {});
      router.replace({ pathname: '/send/status', params: { hash } });
    } catch (e) {
      send.set({ error: e instanceof Error ? e.message : t('errors.generic') });
    } finally { setBusy(false); }
  };

  return (
    <Screen footer={<Button label={prep.requiresStepUp ? t('review.continue') : t('review.confirm')} loading={busy} onPress={confirm} />}>
      <Button variant="link" label="Editar" onPress={() => router.back()} />
      <Title>{t('review.title')}</Title>
      <Row label={t('review.amount')} value={`${formatUsdc(amount)} USDC\n≈ ${formatCop(usd, 4000)}`} />
      <Row label={t('review.to')} value={shortAddress(send.to)} />
      <Row label={t('review.network')} value={chain.name} />
      <Row label={t('review.fee')} value={prep.fee.sponsored ? t('review.sponsored') : `${prep.fee.amount} ${prep.fee.token}${prep.fee.fiatEstimate ? ` (≈ ${prep.fee.fiatEstimate})` : ''}`} />
      {prep.requiresStepUp ? <Notice tone="warn" title="Supera tu límite diario">Te pediremos un código además de Face ID. El contrato rechaza este envío si solo lo firma tu llave de acceso.</Notice> : null}
      {!prep.fee.sponsored ? <Notice>Hoy no podemos cubrir el costo de red. Se descuenta en USDC.</Notice> : null}
      {send.error ? <Notice tone="bad">{send.error}</Notice> : null}
    </Screen>
  );
}
