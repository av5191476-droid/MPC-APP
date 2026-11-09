import { FlatList, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Title, Row, Notice } from '@/ui/primitives';
import { useActivity } from '@/features/activity/queries';
import { chainById } from '@/core/chains';
import { shortAddress } from '@/core/format';
import { useColors } from '@/core/theme/ThemeProvider';

const LABEL = { in: 'Recibiste', out: 'Enviaste', rejected: 'Envío rechazado', dapp: 'Pago a una app', admin: 'Cambio de seguridad' } as const;

export default function Activity() {
  const { t } = useTranslation();
  const c = useColors();
  const { data = [], isLoading } = useActivity();
  return (
    <Screen scroll={false}>
      <Title>{t('tabs.activity')}</Title>
      {!isLoading && data.length === 0 ? <Notice>Cuando envíes o recibas dinero lo verás aquí.</Notice> : null}
      <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Row
            label={`${LABEL[item.kind]}${item.counterparty ? `, ${shortAddress(item.counterparty)}` : ''}\n${chainById(item.chainId)?.name ?? ''}, ${new Date(item.at * 1000).toLocaleString('es-CO')}`}
            right={<View><Text style={{ color: item.kind === 'rejected' ? c.bad : c.ink, fontWeight: '600' }}>{item.kind === 'in' ? '+' : item.kind === 'rejected' ? '' : '−'}{(Number(item.amount) / 1e6).toLocaleString('es-CO', { minimumFractionDigits: 2 })} {item.token}</Text></View>}
          />
        )}
      />
    </Screen>
  );
}
