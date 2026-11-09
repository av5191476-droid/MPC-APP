import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Field, Notice, Screen, Steps, Title, type StepState } from '@/ui/primitives';
import { recoverWithBackup, type RecoverStep } from '@/features/recovery/recover';

const ORDER: RecoverStep[] = ['login', 'download', 'decrypt', 'reshare', 'store', 'backup', 'done'];

export default function Recover() {
  const { t } = useTranslation();
  const [step, setStep] = useState<RecoverStep | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [askPassword, setAskPassword] = useState(false);

  const run = async () => {
    setError(null);
    try {
      const r = await recoverWithBackup(setStep, askPassword ? password : undefined);
      if (r.needsGuardians) return router.replace({ pathname: '/(recovery)/guardians', params: { address: r.account.address } });
      router.replace('/(wallet)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('contraseña')) setAskPassword(true);
      else setError(msg || t('errors.generic'));
      setStep(null);
    }
  };

  const st = (s: RecoverStep): StepState => {
    if (!step) return 'todo';
    const i = ORDER.indexOf(step), j = ORDER.indexOf(s);
    return j < i ? 'done' : j === i ? 'run' : 'todo';
  };

  return (
    <Screen footer={<Button label={t('recovery.start')} loading={!!step && step !== 'done'} onPress={run} />}>
      <Title sub={t('recovery.body')}>{t('recovery.title')}</Title>
      <Steps items={[
        { label: 'Entrar con tu llave de acceso', detail: 'Sincronizada en tu llavero.', state: st('login') },
        { label: 'Descargar tu respaldo', state: st('download') },
        { label: 'Descifrarlo en este teléfono', state: st('decrypt') },
        { label: 'Crear partes nuevas con el servidor', detail: 'La dirección no cambia; la parte del teléfono perdido deja de servir.', state: st('reshare') },
        { label: 'Proteger la parte de este teléfono', state: st('store') },
        { label: 'Guardar el respaldo nuevo', state: st('backup') },
      ]} />
      {askPassword ? <Field label="Contraseña de respaldo" secureTextEntry value={password} onChangeText={setPassword} /> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Screen>
  );
}
