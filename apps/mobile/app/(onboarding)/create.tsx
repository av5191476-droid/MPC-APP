import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Field, Notice, Screen, Steps, Title, type StepState } from '@/ui/primitives';
import { createWallet, type CreateStep } from '@/features/onboarding/createWallet';

const ORDER: CreateStep[] = ['passkey', 'dkg', 'protect', 'seal', 'register', 'done'];

export default function Create() {
  const { t } = useTranslation();
  const [step, setStep] = useState<CreateStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const started = useRef(false);

  const run = useCallback(async (pw?: string) => {
    setError(null);
    try {
      await createWallet(setStep, pw);
      router.replace('/(onboarding)/ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('contraseña de respaldo')) setNeedsPassword(true);
      else setError(t('create.failed'));
      setStep(null);
    }
  }, [t]);

  useEffect(() => { if (!started.current) { started.current = true; void run(); } }, [run]);

  const state = (s: CreateStep): StepState => {
    if (!step) return 'todo';
    const i = ORDER.indexOf(step), j = ORDER.indexOf(s);
    return j < i ? 'done' : j === i ? 'run' : 'todo';
  };

  return (
    <Screen footer={error || needsPassword ? (
      <Button label={t('create.retry')} disabled={needsPassword && password.length < 10} onPress={() => run(needsPassword ? password : undefined)} />
    ) : null}>
      <Title sub={t('create.body')}>{t('create.title')}</Title>
      <Steps items={[
        { label: 'Llave de acceso', detail: 'Creada y ligada a este dominio.', state: state('passkey') },
        { label: t('create.attest'), detail: 'Comprobamos el binario del enclave antes de enviar nada.', state: state('dkg') },
        { label: t('create.protect'), detail: 'Queda en el llavero del teléfono y pide Face ID.', state: state('protect') },
        { label: 'Cifrando tu respaldo', detail: 'Con una clave derivada de tu llave de acceso.', state: state('seal') },
        { label: t('create.delegate'), state: state('register') },
      ]} />
      {needsPassword ? (
        <>
          <Notice tone="warn">{t('backup.noPrf')}</Notice>
          <Field label={t('backup.password')} secureTextEntry value={password} onChangeText={setPassword} textContentType="newPassword" />
        </>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Screen>
  );
}
