import '@/core/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { SchibstedGrotesk_400Regular } from '@expo-google-fonts/schibsted-grotesk';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/core/theme/ThemeProvider';
import { ApiError } from '@/core/api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2, staleTime: 10_000 },
  },
});

export default function RootLayout() {
  const [loaded] = useFonts({
    SchibstedGrotesk: SchibstedGrotesk_400Regular,
    IBMPlexMono: IBMPlexMono_400Regular,
  });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="send" options={{ presentation: 'modal' }} />
            <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
            <Stack.Screen name="dapps/session" options={{ presentation: 'modal' }} />
          </Stack>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
