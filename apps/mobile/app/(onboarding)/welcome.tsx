import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Body, Button, Notice, Screen } from '@/ui/primitives';
import { isSupported } from '@/core/passkey/passkey';
import { useColors } from '@/core/theme/ThemeProvider';
import { type as t } from '@/core/theme/tokens';

export default function Welcome() {
  const { t: tr } = useTranslation();
  const c = useColors();
  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(isSupported()); }, []);

  return (
    <Screen footer={<>
      <Button label={tr('welcome.create')} onPress={() => router.push('/(onboarding)/create')} />
      <Button variant="secondary" label={tr('welcome.recover')} onPress={() => router.push('/(recovery)')} />
    </>}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Text accessibilityRole="header" style={[t.display, { color: c.ink }]}>{tr('welcome.title')}</Text>
        <Body muted style={{ marginTop: 10 }}>{tr('welcome.body')}</Body>
        {!supported ? (
          <Notice tone="warn" title="Tu teléfono no admite llaves de acceso">
            Puedes usar un PIN. Tendrás límites de envío más bajos hasta que uses un teléfono compatible.
          </Notice>
        ) : null}
      </View>
    </Screen>
  );
}
