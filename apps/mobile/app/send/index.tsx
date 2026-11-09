import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { Address } from 'viem';
import { Button, Chip, Field, Notice, Screen, Title } from '@/ui/primitives';
import { chains, SUPPORTED, defaultChainId, chainById } from '@/core/chains';
import { formatUsdc, parseAmount } from '@/core/format';
import { validateRecipient } from '@/core/account/validation';
import { useColors } from '@/core/theme/ThemeProvider';
import { useBalances } from '@/features/activity/queries';
import { prepare } from '@/features/send/sendFlow';
import { useSend } from '@/features/send/store';
import { useWallet } from '@/state/wallet';

export default function SendForm() {
  const { t } = useTranslation();
  const c = useColors();
  const self = useWallet((s) => s.account!.address);
  const send = useSend();
  const { data: balances = [] } = useBalances();
  const [errors, setErrors] = useState<{ to?: string; amount?: string }>({});
  const [busy, setBusy] = useState(false);

  const chainId = send.chainId || defaultChainId;
  const chain = chainById(chainId)!;
  const usdc = chain.usdc as Address;
  const bal = BigInt(balances.find((b) => b.chainId === chainId && b.token === 'USDC')?.amount ?? '0');
  const tokenContracts = Object.values(chains).map((x) => x.usdc);

  const review = async () => {
    const e: typeof errors = {};
    const r = validateRecipient(send.to, self, tokenContracts);
    if (r) e.to = t(`send.errors.${r}`);
    const amount = parseAmount(send.amountText);
    if (!amount || amount <= 0n) e.amount = t('send.errors.amount');
    else if (amount > bal) e.amount = t('send.errors.funds', { amount: formatUsdc(bal), network: chain.name });
    setErrors(e);
    if (e.to || e.amount) return;

    setBusy(true);
    try {
      const prep = await prepare({ to: send.to as Address, amount: amount!, token: usdc, chainId });
      send.set({ prep, token: usdc, error: null });
      router.push('/send/review');
    } catch (err) {
      // 409 = sin patrocinio: reintentar pagando gas en USDC (US2-AS2)
      const p = await prepare({ to: send.to as Address, amount: amount!, token: usdc, chainId }, 'erc20').catch(() => null);
      if (p) { send.set({ prep: p, token: usdc }); router.push('/send/review'); }
      else setErrors({ amount: t('errors.generic') });
    } finally { setBusy(false); }
  };

  return (
    <Screen footer={<Button label={t('send.review')} loading={busy} onPress={review} />}>
      <Button variant="link" label="Cerrar" onPress={() => { send.reset(); router.back(); }} />
      <Title>{t('send.title')} USDC</Title>
      <Field label={t('send.to')} mono placeholder="0x…" value={send.to} onChangeText={(to) => send.set({ to: to.trim() })} error={errors.to} />
      <Field label={t('send.amount')} keyboardType="decimal-pad" placeholder="0,00" value={send.amountText} onChangeText={(amountText) => send.set({ amountText })} error={errors.amount} style={{ fontSize: 28, fontWeight: '700' }} />
      <Text style={{ color: c.muted, fontSize: 13, marginBottom: 14 }}>{t('send.available', { amount: formatUsdc(bal) })}</Text>
      <Text style={{ color: c.muted, fontWeight: '600', fontSize: 13, marginBottom: 6 }}>{t('send.network')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {SUPPORTED.map((k) => <Chip key={k} label={chains[k].name} selected={chains[k].id === chainId} onPress={() => send.set({ chainId: chains[k].id })} />)}
      </View>
      <Notice>Antes de confirmar verás el monto, la red y el costo exactos.</Notice>
    </Screen>
  );
}
