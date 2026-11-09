import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { api } from './api/client';

/** FR-012: recepción, confirmación, fallo y eventos de seguridad (cambios de límite, recuperación). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('security', { name: 'Seguridad', importance: Notifications.AndroidImportance.HIGH });
      }
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      await api('/devices/push-token', { method: 'PUT', body: { token, platform: Platform.OS } }).catch(() => {});
    })();

    // Los avisos de seguridad abren directamente la pantalla donde se puede cancelar.
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as { screen?: string; hash?: string };
      if (data.screen === 'security') router.push('/(wallet)/security');
      if (data.screen === 'status' && data.hash) router.push({ pathname: '/send/status', params: { hash: data.hash } });
    });
    return () => sub.remove();
  }, [enabled]);
}
