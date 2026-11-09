import { useState } from 'react';
import { router } from 'expo-router';
import { Button, Chip, Field, Notice, Row, Screen, Title } from '@/ui/primitives';
import { api } from '@/core/api/client';
import { useWallet } from '@/state/wallet';
import { View } from 'react-native';

type GuardianInput = { label: string; type: 'address' | 'passkey' | 'service'; identifier: string };

/** FR-018: 1–5 guardianes, umbral M-de-N, espera de 72 h. Se instala con firma MPC. */
export default function Guardians() {
  const account = useWallet((s) => s.account)!;
  const [list, setList] = useState<GuardianInput[]>([{ label: 'Servicio de recuperación', type: 'service', identifier: 'default' }]);
  const [label, setLabel] = useState('');
  const [addr, setAddr] = useState('');
  const [threshold, setThreshold] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);

  const add = () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr) || !label) return setMsg('Escribe un nombre y una dirección válida.');
    if (list.length >= 5) return setMsg('Puedes tener hasta 5 guardianes.');
    setList([...list, { label, type: 'address', identifier: addr }]); setLabel(''); setAddr(''); setMsg(null);
  };

  const save = async () => {
    try {
      await api(`/accounts/${account.id}/guardians`, { method: 'PUT', body: { guardians: list, threshold, delaySeconds: 72 * 3600 } });
      router.back();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo guardar.'); }
  };

  return (
    <Screen footer={<Button label="Guardar guardianes" disabled={threshold > list.length} onPress={save} />}>
      <Title sub="Personas o servicios que pueden ayudarte si pierdes el teléfono y el respaldo. Ninguno puede mover tu dinero solo, y siempre hay 72 horas en las que puedes cancelar.">Guardianes</Title>
      {list.map((g, i) => <Row key={i} label={g.label} right={<Button variant="link" label="Quitar" onPress={() => setList(list.filter((_, j) => j !== i))} />} />)}
      <View style={{ marginTop: 16 }}>
        <Field label="Nombre" value={label} onChangeText={setLabel} />
        <Field label="Dirección de su billetera" mono value={addr} onChangeText={setAddr} placeholder="0x…" />
        <Button variant="secondary" label="Añadir guardián" onPress={add} />
      </View>
      <Notice title="Aprobaciones necesarias">
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {list.map((_, i) => <Chip key={i} label={`${i + 1} de ${list.length}`} selected={threshold === i + 1} onPress={() => setThreshold(i + 1)} />)}
        </View>
      </Notice>
      {msg ? <Notice tone="bad">{msg}</Notice> : null}
    </Screen>
  );
}
