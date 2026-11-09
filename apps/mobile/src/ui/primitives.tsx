import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/core/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type as t } from '@/core/theme/tokens';

export function Screen({ children, scroll = true, footer }: { children: ReactNode; scroll?: boolean; footer?: ReactNode }) {
  const c = useColors();
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }} edges={['top', 'left', 'right']}>
      <Body style={{ flex: 1 }} contentContainerStyle={scroll ? { padding: space.xl, flexGrow: 1 } : undefined} keyboardShouldPersistTaps="handled">
        {scroll ? children : <View style={{ flex: 1, padding: space.xl }}>{children}</View>}
      </Body>
      {footer ? <View style={{ padding: space.xl, paddingTop: space.md, gap: space.sm }}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: space.lg, marginBottom: space.lg }}>
      <Text accessibilityRole="header" style={[t.title, { color: c.ink }]}>{children}</Text>
      {sub ? <Text style={[t.body, { color: c.muted, marginTop: 6 }]}>{sub}</Text> : null}
    </View>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const c = useColors();
  return <Text style={[t.body, { color: muted ? c.muted : c.ink }, style]}>{children}</Text>;
}

type ButtonProps = { label: string; onPress(): void; variant?: 'primary' | 'secondary' | 'link'; disabled?: boolean; loading?: boolean };
export function Button({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const c = useColors();
  const bg = variant === 'primary' ? c.ink : variant === 'secondary' ? c.sunk : 'transparent';
  const fg = variant === 'primary' ? c.surface : variant === 'link' ? c.device : c.ink;
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, mono, ...props }: TextInputProps & { label: string; error?: string | null; mono?: boolean }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[t.small, { color: c.muted, fontWeight: '600', marginBottom: 6 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        autoCorrect={false}
        autoCapitalize="none"
        {...props}
        style={[s.input, { borderColor: error ? c.bad : c.line, color: c.ink, fontFamily: mono ? 'IBMPlexMono' : undefined }, props.style]}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={[t.small, { color: c.bad, marginTop: 6 }]}>{error}</Text> : null}
    </View>
  );
}

export function Notice({ title, children, tone = 'neutral' }: { title?: string; children: ReactNode; tone?: 'neutral' | 'warn' | 'bad' }) {
  const c = useColors();
  const bg = tone === 'warn' ? c.server + '22' : tone === 'bad' ? c.bad + '1F' : c.sunk;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.field, padding: space.md, marginVertical: space.sm }}>
      {title ? <Text style={{ color: c.ink, fontWeight: '700', marginBottom: 2 }}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={[t.small, { color: c.ink }]}>{children}</Text> : children}
    </View>
  );
}

export function Row({ label, value, right }: { label: string; value?: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[s.row, { borderBottomColor: c.line }]}>
      <Text style={[t.small, { color: c.muted, flexShrink: 1 }]}>{label}</Text>
      {right ?? <Text style={{ color: c.ink, fontWeight: '600', textAlign: 'right', flexShrink: 1 }}>{value}</Text>}
    </View>
  );
}

export type StepState = 'todo' | 'run' | 'done' | 'fail';
export function Steps({ items }: { items: { label: string; detail?: string; state: StepState }[] }) {
  const c = useColors();
  const color = { todo: c.line, run: c.device, done: c.good, fail: c.bad };
  return (
    <View accessibilityRole="list" style={{ marginVertical: space.lg }}>
      {items.map((it, i) => (
        <View key={it.label} style={{ flexDirection: 'row', gap: space.md, minHeight: 44 }}>
          <View style={{ alignItems: 'center', width: 14 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 5, borderWidth: 2, borderColor: color[it.state], backgroundColor: it.state === 'done' || it.state === 'fail' ? color[it.state] : 'transparent' }} />
            {i < items.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: c.line }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: space.md }} accessibilityLabel={`${it.label}: ${it.state === 'done' ? 'listo' : it.state === 'run' ? 'en curso' : it.state === 'fail' ? 'falló' : 'pendiente'}`}>
            <Text style={{ color: c.ink, fontSize: 15 }}>{it.label}</Text>
            {it.detail && it.state !== 'todo' ? <Text style={[t.small, { color: c.muted }]}>{it.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function Chip({ label, onPress, selected }: { label: string; onPress?(): void; selected?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={{ borderWidth: 1, borderColor: selected ? c.ink : c.line, backgroundColor: selected ? c.ink : c.surface, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' }}>
      <Text style={{ color: selected ? c.surface : c.ink, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: { minHeight: 52, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  input: { minHeight: MIN_TOUCH + 2, borderWidth: 1, borderRadius: radius.field, paddingHorizontal: 14, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
});
