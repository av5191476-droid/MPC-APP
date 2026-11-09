import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { Button, Field, Notice, Row, Screen, Title } from '@/ui/primitives';
import { formatUsdc, hoursLeft, parseAmount } from '@/core/format';
import { useColors } from '@/core/theme/ThemeProvider';
import { radius } from '@/core/theme/tokens';
import { usePolicies } from '@/features/activity/queries';
import { cancelPendingChange, prepareLimitChange, submitLimitChange } from '@/features/policies/changeLimit';
import { requestStepUp } from '@/features/send/sendFlow';
import { useWallet } from '@/state/wallet';
import { useSend } from '@/features/send/store';
import { defaultChainId } from '@/core/chains';

export default function Security() {
  const { t } = useTranslation();
  const c = useColors();
  const qc = useQueryClient();
  const backup = useWallet((s) => s.backup);
  const { data: policies = [] } = usePolicies();
  const policy = policies.find((p) => p.chainId === defaultChainId);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const limit = policy ? BigInt(policy.limitAmount) : 0n;
  const spent = policy ? BigInt(policy.spent) : 0n;
  const pct = limit > 0n ? Math.min(100, Number((spent * 100n) / limit)) : 0;

  const change = async () => {
    const amount = parseAmount(value);
    if (!amount || !policy) return setError(t('send.errors.amount'));
    if (amount === limit) return setError('Ese ya es tu límite.');
    setBusy(true); setError(null);
    try {
      const prep = await prepareLimitChange(policy.chainId, policy.token as Hex, amount);
      if (prep.kind === 'relax') {
        // Subir: código + co-firma; se aplica en 48 h.
        const ch = await requestStepUp(prep.userOpHash);
        useSend.getState().set({ prep, chainId: policy.chainId, challenge: { id: ch.challengeId, destination: ch.destination } });
        router.push({ pathname: '/send/stepup', params: { purpose: 'policy' } });
        return;
      }
      await submitLimitChange(prep, policy.chainId);
      await qc.invalidateQueries({ queryKey: ['policies'] });
      setValue('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Title>{t('security.title')}</Title>
      <Row label={t('security.limit')} value={`${formatUsdc(limit)} USDC`} />
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 10, borderRadius: 6, backgroundColor: c.sunk, overflow: 'hidden', marginTop: 10 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.passkey, borderRadius: radius.field }} />
      </View>
      <Text style={{ color: c.muted, fontSize: 13, marginTop: 6 }}>{t('security.used', { amount: formatUsdc(spent) })}</Text>

      {policy?.pendingChange ? (
        <Notice tone="warn" title={t('security.pending', { amount: formatUsdc(BigInt(policy.pendingChange.limitAmount)), left: hoursLeft(policy.pendingChange.effectiveAt * 1000) })}>
          <Button variant="link" label={t('security.cancel')} onPress={() => cancelPendingChange(policy.chainId, policy.token as Hex).then(() => qc.invalidateQueries({ queryKey: ['policies'] }))} />
        </Notice>
      ) : null}

      <View style={{ marginTop: 18 }}>
        <Field label={t('security.newLimit')} keyboardType="decimal-pad" value={value} onChangeText={setValue} error={error} />
        <Text style={{ color: c.muted, fontSize: 13, marginBottom: 10 }}>{t('security.lowerNow')}</Text>
        <Button variant="secondary" label={t('security.change')} loading={busy} onPress={change} />
      </View>

      <View style={{ marginTop: 26 }}>
        <Row label={t('security.backup')} right={backup === 'uploaded' ? <Text style={{ color: c.good, fontWeight: '600' }}>Listo</Text> : <Button variant="link" label="Guardar" onPress={() => router.push('/(onboarding)/backup')} />} />
        <Row label={t('security.guardians')} right={<Button variant="link" label="Configurar" onPress={() => router.push('/(settings)/guardians')} />} />
        <Row label={t('security.emergency')} right={<Button variant="link" label="Abrir" onPress={() => router.push('/(settings)/emergency')} />} />
      </View>
    </Screen>
  );
}
