import { router } from 'expo-router';
import { Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Notice, Screen, Title } from '@/ui/primitives';
import { api } from '@/core/api/client';
import type { AccountDto } from '@/core/api/types';
import { chains, SUPPORTED } from '@/core/chains';
import { useColors } from '@/core/theme/ThemeProvider';
import { useWallet } from '@/state/wallet';

export default function Receive() {
  const { t } = useTranslation();
  const c = useColors();
  const account = useWallet((s) => s.account)!;
  const { data } = useQuery({ queryKey: ['account', account.id], queryFn: () => api<AccountDto>(`/accounts/${account.id}`) });
  const active = new Set(data?.chains.filter((x) => x.status === 'active').map((x) => x.chainId));

  return (
    <Screen footer={<>
      <Button label="Compartir dirección" onPress={() => Share.share({ message: account.address })} />
      <Button variant="link" label="Cerrar" onPress={() => router.back()} />
    </>}>
      <Title sub={t('receive.body')}>{t('receive.title')}</Title>
      <View style={{ alignSelf: 'center', padding: 14, backgroundColor: '#FFFFFF', borderRadius: 18 }} accessibilityLabel="Código QR con tu dirección">
        <QRCode value={account.address} size={200} />
      </View>
      <Notice><Text selectable style={{ fontFamily: 'IBMPlexMono', color: c.ink, textAlign: 'center' }}>{account.address}</Text></Notice>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {SUPPORTED.map((k) => <Chip key={k} label={`${chains[k].name}${active.has(chains[k].id) ? '' : ` (${t('receive.inactive')})`}`} selected={active.has(chains[k].id)} />)}
      </View>
      <Notice tone="warn">No envíes desde redes que no estén en esta lista: esos fondos no aparecerán aquí.</Notice>
    </Screen>
  );
}
