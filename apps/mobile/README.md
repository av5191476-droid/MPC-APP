# App móvil (Expo, New Architecture)

## Arrancar
```bash
cp .env.example .env            # completa API, RP ID y PCR0
pnpm install
pnpm --filter @hw/mobile mpc:build   # genera el módulo nativo hw-mpc con uniffi-bindgen-react-native
pnpm --filter @hw/mobile ios         # o android; passkeys requieren dispositivo físico
pnpm --filter @hw/mobile test        # unitarias (vitest)
pnpm --filter @hw/mobile e2e:ios     # Maestro, contra staging
```
Antes de probar passkeys publica `apple-app-site-association` (webcredentials) y
`assetlinks.json` en el dominio del RP ID (T029).

## Mapa de carpetas
```
app/                         expo-router
  (onboarding)/              welcome → create (passkey + DKG) → ready → backup        US1
  (wallet)/                  pestañas: inicio, actividad, seguridad, conexiones
  send/                      formulario → revisión → código → estado                  US2, US3
  receive.tsx                QR + red explícita                                        US2-AS5
  (settings)/                guardianes, salida de emergencia                          US4, FR-019
  (recovery)/                respaldo + servidor (resharing) o guardianes             US4
  dapps/session.tsx          permisos legibles de una session key                     US5
src/core/
  api/                       cliente con JWT 15 min + refresh rotativo
  passkey/                   registro, login, firma de userOpHash, PRF, parseo WebAuthn
  mpc/                       attestation Nitro, rondas D↔S, puente nativo
  secure/deviceShare.ts      parte D en llavero biométrico, THIS_DEVICE_ONLY, zeroize
  backup/                    HKDF(PRF) / Argon2id + AES-GCM, iCloud / Drive appData
  account/                   dirección desde la PK MPC, validación de destinatarios
  theme/, i18n/              tokens del showcase; es-CO por defecto
src/features/                orquestación por historia (sin UI)
src/ui/                      componentes accesibles (≥ 48 px, roles, live regions)
native/mpc/                  crate Rust + uniffi; adaptador sobre DKLs23 auditado
e2e/                         flujos Maestro
test/                        unitarias de lógica pura
```

## Reglas que el código respeta
- Ninguna parte de llave toca `zustand`, logs ni AsyncStorage. Cada uso de una parte termina en `.fill(0)`.
- La parte B solo existe en claro dentro del DKG o de una recuperación; se guarda cifrada (sobre pendiente) hasta subirla.
- La salida de emergencia no llama a nuestro backend: RPC público + D + B.
- `native/mpc` falla con `BackendNotLinked` mientras no se enlace la biblioteca DKLs23 auditada. No hay criptografía propia.

## Conocido / pendiente
- Una firma sobre el límite pide Face ID dos veces (passkey y llavero de la parte D). Se puede unir con un `LAContext` compartido en un módulo nativo.
- Google Drive necesita Google Sign-In con scope `drive.appdata` antes de `setGoogleAccessToken`.
- Faltan: pantalla de escaneo WalletConnect, firma automática con session key para `wallet_sendCalls`, modo PIN para dispositivos sin passkey (T056), métricas SC-001/002 (T057).
