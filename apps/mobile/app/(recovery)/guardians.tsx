import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { RecoveryRequest } from '@/core/api/types';
import { hoursLeft, shortAddress } from '@/core/format';
import { getRecovery, startGuardianRecovery } from '@/features/recovery/recover';
import { Button, Notice, Row, Screen, Title } from '@/ui/primitives';

/** US4-AS3/AS4: barrido a cuenta nueva tras 72 h; el titular original recibe alertas y puede cancelar. */
export default function GuardianRecovery() {
  const { t } = useTranslation();
  const { address } = useLocalSearchParams<{ address: string }>();
  const [req, setReq] = useState<RecoveryRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!req) return;
    const id = setInterval(() => getRecovery(req.id).then(setReq).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [req]);

  const start = async () => {
    try { setReq(await startGuardianRecovery(address)); } catch (e) { setError(e instanceof Error ? e.message : t('errors.generic')); }
  };

  return (
    <Screen footer={!req ? <Button label={t('recovery.useGuardians')} onPress={start} /> : null}>
      <Title sub={t('recovery.noBackup')}>Recuperación con guardianes</Title>
      {req ? (
        <>
          <Row label="Estado" value={{ initiated: 'Esperando aprobaciones', verifying: 'Verificando', timelocked: 'En espera de seguridad', executed: 'Completada', cancelled: 'Cancelada', failed: 'Falló' }[req.status]} />
          {req.newAddress ? <Row label="Cuenta nueva" value={shortAddress(req.newAddress)} /> : null}
          {req.timelockEndsAt ? <Row label="Se ejecuta en" value={hoursLeft(req.timelockEndsAt * 1000)} /> : null}
          <Notice>Avisamos a tus guardianes. Te notificaremos aquí y por correo en cada paso.</Notice>
        </>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Screen>
  );
}
