import type { ExpoConfig } from 'expo/config';

/** RP ID de WebAuthn: debe coincidir con apple-app-site-association y assetlinks.json (T029). */
const RP_ID = process.env.EXPO_PUBLIC_RP_ID ?? 'wallet.example.com';

const config: ExpoConfig = {
  name: 'Billetera',
  slug: 'hybrid-wallet',
  scheme: 'hybridwallet',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'com.example.hybridwallet',
    supportsTablet: false,
    associatedDomains: [`webcredentials:${RP_ID}`],
    usesIcloudStorage: true,
    infoPlist: {
      NSFaceIDUsageDescription: 'Usamos Face ID para proteger tu llave y confirmar cada envío.',
    },
    entitlements: {
      'com.apple.developer.icloud-container-identifiers': ['iCloud.com.example.hybridwallet'],
      'com.apple.developer.icloud-services': ['CloudDocuments', 'CloudKit'],
    },
  },
  android: {
    package: 'com.example.hybridwallet',
    minSdkVersion: 28, // Android 9 (FR-022)
    // allowBackup=false: la parte del dispositivo nunca entra al backup automático de Android.
    allowBackup: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    ['expo-notifications', { color: '#0F7B6C' }],
    ['expo-local-authentication', { faceIDPermission: 'Usamos Face ID para proteger tu llave.' }],
    ['react-native-cloud-storage', { iCloudContainerEnvironment: 'Production' }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    rpId: RP_ID,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.example.com/v1',
    // PCR0 del binario reproducible del enclave publicado por CI (T007).
    expectedPcr0: process.env.EXPO_PUBLIC_ENCLAVE_PCR0 ?? '',
    defaultChainId: Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 84532),
  },
};

export default config;
