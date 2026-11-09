import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Field, Notice, Screen, Title } from '@/ui/primitives';
import { execute, requestStepUp, verifyStepUp } from '@/features/send/sendFlow';
import { useSend } from '@/features/send/store';
import { submitLimitChange } from '@/features/policies/changeLimit';

/** US3-AS2: OTP ligado al userOpHash → stepUpToken → passkey + co-firma MPC. */
export default function StepUp() {
  const { t } = useTranslation();
  const { purpose } = useLocalSearchParams<{ purpose: 'send' | 'policy' }>();
  const send = useSend();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (!send.challenge || !send.prep) return;
    setBusy(true); setError(null);
    try {
      const { stepUpToken } = await verifyStepUp(send.challenge.id, code);
      if (purpose === 'policy') {
        await submitLimitChange({ ...send.prep, kind: 'relax' }, send.chainId, stepUpToken);
        send.reset();
        router.back(); // Seguridad muestra el cambio pendiente con su cuenta regresiva
        return;
      }
      const hash = await execute(send.prep, send.chainId, () => {}, stepUpToken);
      router.replace({ pathname: '/send/status', params: { hash } });
    } catch (e) {
      setError(e instanceof Error && e.message.includes('code') ? t('stepup.wrong') : e instanceof Error ? e.message : t('errors.generic'));
    } finally { setBusy(false); }
  };

  return (
    <Screen footer={<>
      <Button label={t('stepup.verify')} disabled={code.length !== 6} loading={busy} onPress={verify} />
      <Button variant="link" label={t('stepup.resend')} onPress={() => send.prep && requestStepUp(send.prep.userOpHash).then((c) => send.set({ challenge: { id: c.challengeId, destination: c.destination } }))} />
    </>}>
      <Title sub={t('stepup.body', { dest: send.challenge?.destination ?? '' })}>{t('stepup.title')}</Title>
      <Field label={t('stepup.code')} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6}
        value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} error={error} style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} />
      <Notice>Nunca te pediremos este código por teléfono ni por chat.</Notice>
    </Screen>
  );
}
