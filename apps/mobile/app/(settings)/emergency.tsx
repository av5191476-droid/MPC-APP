import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Address } from 'viem';
import { View } from 'react-native';
import { Button, Chip, Field, Notice, Screen, Title } from '@/ui/primitives';
import { chains, SUPPORTED, defaultChainId, chainById } from '@/core/chains';
import { emergencyExit } from '@/features/recovery/emergency';
import { useWallet } from '@/state/wallet';

/** FR-019: funciona con nuestro servidor caído. Ver docs/salida-de-emergencia.md. */
export default function Emergency() {
  const { t } = useTranslation();
  const { backup, backupKdf } = useWallet();
  const [to, setTo] = useState('');
  const [password, setPassword] = useState('');
  const [chainId, setChainId] = useState(defaultChainId);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const run = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return setResult({ ok: false, msg: 'Escribe una dirección válida que controles.' });
    setBusy(true); setResult(null);
    try {
      const tx = await emergencyExit(chainId, chainById(chainId)!.usdc as Address, to as Address, backupKdf === 'argon2id' ? password : undefined);
      setResult({ ok: true, msg: `Transacción enviada: ${tx}` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : t('errors.generic') });
    } finally { setBusy(false); }
  };

  return (
    <Screen footer={<>
      <Button label="Mover todo el USDC" disabled={backup !== 'uploaded'} loading={busy} onPress={run} />
      <Button variant="link" label="Volver" onPress={() => router.back()} />
    </>}>
      <Title sub={t('emergency.body')}>{t('emergency.title')}</Title>
      {backup !== 'uploaded' ? <Notice tone="bad">{t('emergency.needBackup')}</Notice> : null}
      <Field label={t('emergency.to')} mono placeholder="0x…" value={to} onChangeText={setTo} />
      {backupKdf === 'argon2id' ? <Field label="Contraseña de respaldo" secureTextEntry value={password} onChangeText={setPassword} /> : null}
      <Notice>{'Necesitas un poco de ETH (o POL en Polygon) en esta dirección para pagar la red, porque aquí no usamos nuestro patrocinio.'}</Notice>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {SUPPORTED.map((k) => <Chip key={k} label={chains[k].name} selected={chains[k].id === chainId} onPress={() => setChainId(chains[k].id)} />)}
      </View>
      {result ? <Notice tone={result.ok ? 'neutral' : 'bad'}>{result.msg}</Notice> : null}
    </Screen>
  );
}
