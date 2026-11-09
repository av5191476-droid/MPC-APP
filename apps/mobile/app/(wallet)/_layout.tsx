import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useColors } from '@/core/theme/ThemeProvider';
import { useWallet } from '@/state/wallet';
import { usePushRegistration } from '@/core/notifications';

const icon = (d: string) => ({ color }: { color: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>
);

export default function WalletTabs() {
  const { t } = useTranslation();
  const c = useColors();
  const account = useWallet((s) => s.account);
  usePushRegistration(!!account);
  if (!account) return <Redirect href="/(onboarding)/welcome" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.ink, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line } }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('M4 11l8-7 8 7v9H4z') }} />
      <Tabs.Screen name="activity" options={{ title: t('tabs.activity'), tabBarIcon: icon('M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01') }} />
      <Tabs.Screen name="security" options={{ title: t('tabs.security'), tabBarIcon: icon('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z') }} />
      <Tabs.Screen name="connections" options={{ title: t('tabs.connections'), tabBarIcon: icon('M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1') }} />
    </Tabs>
  );
}
