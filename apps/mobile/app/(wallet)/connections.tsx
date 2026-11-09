import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text } from 'react-native';
import { Button, Notice, Row, Screen, Title } from '@/ui/primitives';
import { api } from '@/core/api/client';
import type { AccountDto } from '@/core/api/types';
import { chains, SUPPORTED } from '@/core/chains';
import { shortAddress } from '@/core/format';
import { useColors } from '@/core/theme/ThemeProvider';
import { useWallet } from '@/state/wallet';

type SessionDto = { id: string; dappOrigin: string; validUntil: number; status: 'active' | 'revoked' | 'expired' };

export default function Connections() {
  const c = useColors();
  const qc = useQueryClient();
  const account = useWallet((s) => s.account)!;
  const [busy, setBusy] = useState<string | null>(null);
  const { data: acc } = useQuery({ queryKey: ['account', account.id], queryFn: () => api<AccountDto>(`/accounts/${account.id}`) });
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions', account.id], queryFn: () => api<SessionDto[]>(`/session-keys?accountId=${account.id}`) });

  /** US6: autorización 7702 por red + replicación de módulos (requiere co-firma MPC en el servidor). */
  const activate = async (chainId: number) => {
    setBusy(String(chainId));
    try { await api(`/accounts/${account.id}/chains`, { method: 'POST', body: { chainId } }); await qc.invalidateQueries({ queryKey: ['account'] }); }
    finally { setBusy(null); }
  };

  const revoke = async (id: string) => {
    setBusy(id);
    try { await api(`/session-keys/${id}`, { method: 'DELETE' }); await qc.invalidateQueries({ queryKey: ['sessions'] }); }
    finally { setBusy(null); }
  };

  return (
    <Screen>
      <Title>Conexiones</Title>
      <Text style={{ color: c.ink, fontWeight: '700', marginTop: 6 }}>Apps conectadas</Text>
      {sessions.filter((s) => s.status === 'active').length === 0 ? <Notice>Escanea el código de WalletConnect de una app para conectarla.</Notice> : null}
      {sessions.filter((s) => s.status === 'active').map((s) => (
        <Row key={s.id} label={`${new URL(s.dappOrigin).host}\nVence ${new Date(s.validUntil * 1000).toLocaleString('es-CO')}`}
          right={<Button variant="link" label="Desconectar" loading={busy === s.id} onPress={() => revoke(s.id)} />} />
      ))}

      <Text style={{ color: c.ink, fontWeight: '700', marginTop: 22 }}>Redes</Text>
      {SUPPORTED.map((k) => {
        const ch = chains[k];
        const active = acc?.chains.some((x) => x.chainId === ch.id && x.status === 'active');
        const pending = acc?.chains.some((x) => x.chainId === ch.id && x.status === 'pending');
        return (
          <Row key={k} label={`${ch.name}\n${shortAddress(account.address)}`}
            right={active ? <Text style={{ color: c.good, fontWeight: '600' }}>Activa</Text>
              : pending ? <Text style={{ color: c.muted }}>Activando…</Text>
              : <Button variant="link" label="Activar" loading={busy === String(ch.id)} onPress={() => activate(ch.id)} />} />
        );
      })}
    </Screen>
  );
}
