import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Field, Notice, Screen, Title } from '@/ui/primitives';
import { cloudName } from '@/core/backup/cloud';
import { uploadAndVerify } from '@/features/onboarding/uploadBackup';
import { useWallet } from '@/state/wallet';

export default function Backup() {
  const { t } = useTranslation();
  const kdf = useWallet((s) => s.backupKdf);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await uploadAndVerify(kdf === 'argon2id' ? password : undefined);
      router.replace('/(wallet)');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    } finally { setBusy(false); }
  };

  return (
    <Screen footer={<>
      <Button label={busy ? t('backup.saving') : t('backup.save', { cloud: cloudName })} loading={busy} onPress={save} />
      <Button variant="link" label={t('ready.later')} onPress={() => router.replace('/(wallet)')} />
    </>}>
      <Title sub={t('backup.body', { cloud: cloudName })}>{t('backup.title')}</Title>
      {kdf === 'argon2id' ? <Field label={t('backup.password')} secureTextEntry value={password} onChangeText={setPassword} /> : null}
      <Notice>{`${cloudName} solo ve el respaldo cifrado. Sin tu llave de acceso no sirve para nada.`}</Notice>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Screen>
  );
}
