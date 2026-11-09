import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/core/theme/ThemeProvider';
import { radius, space } from '@/core/theme/tokens';
import { chainById } from '@/core/chains';
import { shortAddress } from '@/core/format';
import { useBalances } from '@/features/activity/queries';
import { shouldRemindBackup, useWallet } from '@/state/wallet';
import { Money } from '@/ui/Money';
import { Button, Notice, Row } from '@/ui/primitives';

export default function Home() {
  const { t } = useTranslation();
  const c = useColors();
  const wallet = useWallet();
  const { data: balances = [], refetch, isRefetching, isError } = useBalances();
  const stable = balances.filter((b) => b.token === 'USDC' || b.token === 'USDT');
  const totalUsd = stable.reduce((acc, b) => acc + Number(b.amount) / 10 ** b.decimals, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.xl }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {shouldRemindBackup(wallet, totalUsd) ? (
          <Notice tone="warn" title="Falta tu respaldo">
            <Button variant="link" label="Guardarlo ahora" onPress={() => router.push('/(onboarding)/backup')} />
          </Notice>
        ) : null}
        {isError ? <Notice tone="bad">{t('errors.network')}</Notice> : null}
        <View style={{ marginTop: space.lg }}><Money usd={totalUsd} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Copiar dirección"
          onPress={() => Clipboard.setStringAsync(wallet.account!.address)}
          style={{ alignSelf: 'flex-start', backgroundColor: c.sunk, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', marginTop: space.md }}>
          <Text style={{ fontFamily: 'IBMPlexMono', color: c.ink, fontSize: 13 }}>{shortAddress(wallet.account?.address)}</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: space.sm, marginVertical: space.xl }}>
          <View style={{ flex: 1 }}><Button label={t('home.send')} onPress={() => router.push('/send')} /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" label={t('home.receive')} onPress={() => router.push('/receive')} /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" label={t('home.limits')} onPress={() => router.push('/(wallet)/security')} /></View>
        </View>

        {stable.length === 0 ? <Notice>{t('home.empty')}</Notice> : stable.map((b) => (
          <Row key={`${b.chainId}-${b.token}`} label={`${b.token} en ${chainById(b.chainId)?.name ?? b.chainId}`}
            value={new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(b.amount) / 10 ** b.decimals)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
