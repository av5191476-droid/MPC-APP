import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { Hex } from 'viem';
import type { UserOpStatus } from '@/core/api/types';
import { Button, Notice, Screen, Steps, Title, type StepState } from '@/ui/primitives';
import { waitForStatus } from '@/features/send/sendFlow';
import { useSend } from '@/features/send/store';

export default function Status() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { hash } = useLocalSearchParams<{ hash: Hex }>();
  const reset = useSend((s) => s.reset);
  const [s, setS] = useState<UserOpStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void waitForStatus(hash, (x) => alive && setS(x)).then(() => qc.invalidateQueries({ queryKey: ['balances'] }));
    return () => { alive = false; };
  }, [hash, qc]);

  const reverted = s?.status === 'failed' && !!s.revertReason;
  const st = (target: UserOpStatus['status'][]): StepState =>
    !s ? 'todo' : target.includes(s.status) ? 'done' : s.status === 'failed' || s.status === 'dropped' ? 'fail' : 'run';
  const done = s && ['included', 'failed', 'dropped'].includes(s.status);

  return (
    <Screen footer={done ? <Button label={t('status.home')} onPress={() => { reset(); router.dismissAll(); }} /> : null}>
      <Title>{reverted ? t('status.rejected') : s?.status === 'included' ? 'Enviado' : s?.status === 'failed' || s?.status === 'dropped' ? t('status.failed') : 'Enviando…'}</Title>
      <Steps items={[
        { label: t('status.signed'), state: 'done' },
        { label: t('status.submitted'), state: s ? (s.status === 'submitted' ? 'run' : 'done') : 'run' },
        { label: t('status.included'), detail: s?.blockNumber ? `Bloque ${s.blockNumber.toLocaleString('es-CO')}` : undefined, state: st(['included']) },
      ]} />
      {reverted ? <Notice tone="bad" title={t('status.rejectedBody')}>Superaba tu límite diario y solo la firmó tu llave de acceso.</Notice> : null}
      {s?.status === 'dropped' ? <Notice tone="warn">La red descartó la operación. La reintentamos con un nonce nuevo sin riesgo de doble envío.</Notice> : null}
      {!done ? <Notice>Puedes cerrar la app; te avisaremos cuando se confirme.</Notice> : null}
    </Screen>
  );
}
