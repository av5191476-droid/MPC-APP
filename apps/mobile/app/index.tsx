import { Redirect } from 'expo-router';
import { useWallet } from '@/state/wallet';

export default function Index() {
  const account = useWallet((s) => s.account);
  return <Redirect href={account ? '/(wallet)' : '/(onboarding)/welcome'} />;
}
