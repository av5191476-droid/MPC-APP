import { Text, View } from 'react-native';
import { useColors } from '@/core/theme/ThemeProvider';
import { type as t } from '@/core/theme/tokens';
import { formatCop } from '@/core/format';

export function Money({ usd, copRate = 4000 }: { usd: number; copRate?: number }) {
  const c = useColors();
  const value = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usd);
  return (
    <View accessible accessibilityLabel={`${value} dólares, aproximadamente ${formatCop(usd, copRate)}`}>
      <Text style={[t.money, { color: c.ink }]}>{value} <Text style={{ fontSize: 18, color: c.muted, fontWeight: '500' }}>USD</Text></Text>
      <Text style={[t.small, { color: c.muted }]}>≈ {formatCop(usd, copRate)}</Text>
    </View>
  );
}
