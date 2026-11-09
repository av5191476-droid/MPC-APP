import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { Button, Notice, Screen, Title } from '@/ui/primitives';
import { useWallet } from '@/state/wallet';
import { useColors } from '@/core/theme/ThemeProvider';
import { cloudName } from '@/core/backup/cloud';

export default function Ready() {
  const { t } = useTranslation();
  const c = useColors();
  const address = useWallet((s) => s.account?.address);
  return (
    <Screen footer={<>
      <Button label={`${t('ready.backup')} en ${cloudName}`} onPress={() => router.replace('/(onboarding)/backup')} />
      <Button variant="secondary" label={t('ready.later')} onPress={() => router.replace('/(wallet)')} />
    </>}>
      <Title sub={t('ready.body')}>{t('ready.title')}</Title>
      <Notice><Text selectable style={{ fontFamily: 'IBMPlexMono', color: c.ink }}>{address}</Text></Notice>
      <Notice tone="warn" title="Guarda tu respaldo">{t('backup.reminder')}</Notice>
    </Screen>
  );
}
