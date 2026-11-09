# Implementación v0.1 — núcleo de seguridad

Código base para `specs/001-hybrid-wallet`. Prioriza lo que sostiene el modelo híbrido:
contratos, la puerta de co-firma del servidor y el cifrado del respaldo. El resto del
monorepo (pantallas Expo, indexador, push) se construye encima siguiendo `tasks.md`.

> Nada de esto está auditado. No se pudo compilar ni ejecutar en el entorno donde se
> escribió (sin red para instalar OZ, viem ni Rust). Primer paso obligatorio: instalar
> dependencias y correr todas las pruebas (Constitución III).

## Puesta en marcha
```bash
pnpm install
cd contracts && forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 foundry-rs/forge-std
forge test -vv                              # T030, T031, T073, T074
pnpm --filter @hw/sdk test
pnpm --filter @hw/api test                  # T075
cargo test --manifest-path services/enclave-signer/Cargo.toml
pnpm --filter @hw/mobile test
pnpm --filter @hw/api db:migrate && pnpm --filter @hw/api dev
```

## Qué hay y a qué tarea corresponde

| Archivo | Tareas | Estado |
|---|---|---|
| `contracts/src/account/HybridAccount.sol` | T011, T077 | Validación 4337, selección de validador por nonce key, firma compuesta, ERC-7579 install/uninstall, ERC-1271, storage ERC-7201 |
| `contracts/src/validators/WebAuthnValidator.sol` | T046 | Sobre OZ `WebAuthn` (UV obligatorio, s bajo, precompile P256 con fallback) |
| `contracts/src/hooks/SpendingPolicyHook.sol` | T076 | Límite por token, approve cuenta, relajar 48 h, endurecer inmediato, allowlist con timelock |
| `contracts/src/recovery/GuardianRecovery.sol` | T091 | M-de-N (EOA o 1271), ≥ 72 h, cancelable, ejecuta lote (rotación o barrido) |
| `contracts/src/paymaster/HybridPaymaster.sol` | T063 | Modo verifying. **Falta** modo ERC-20 |
| `contracts/test/unit/*` | T030, T031, T073, T074 | Unit + fuzz. Faltan handlers de invariantes y fork tests (T037) |
| `contracts/script/Deploy.s.sol` | T012 | CREATE2 con salt fijo |
| `packages/sdk` | T026 | Nonce ERC-7579, callData `executeUserOp`, hash v0.8 EIP-712, firmas, espejo del hook |
| `services/api/.../cosign-policy.ts` | T075, T079 | Puerta de co-firma: hash recalculado, stepUpToken ligado y de un uso, antifraude, aviso de 48 h para cambios admin |
| `services/api/src/lib/logger.ts` | T020, T036 | Redacción pino + detector de secretos para el test de no-filtración |
| `services/enclave-signer` | T021 (parcial) | Puerta del enclave + zeroize. La biblioteca DKLs23 auditada se conecta detrás de `ThresholdEcdsa` |
| `apps/mobile/src/core/backup/backupKey.ts` | T049 | HKDF(PRF) + AES-256-GCM con AAD (cuenta, época), @noble |
| `apps/mobile/` | T024–T029, T045, T048–T056, T067–T071, T081–T082, T087, T093–T095, T102 | App Expo completa: 20 pantallas, flujos por historia, puente MPC nativo, respaldo, push, E2E. Ver `apps/mobile/README.md` |
| `services/api/prisma/schema.prisma` | T014 | Esquema completo de data-model.md + refresh tokens y push |
| `services/api/src/modules/*` | T017, T018, T023, T064, T078, T080, T092 | Auth WebAuthn, cuentas, relay MPC con puerta de co-firma, OTP, UserOps, políticas, recuperación, actividad, session keys |
| `services/api/src/server.ts` | — | Fastify con JWT, rate limit en Redis, redacción y manejo de errores |
| `showcase.html` | — | Recorrido interactivo de US1–US6 y la mesa de firma |

## Decisiones que cambian la spec (actualizar spec/plan con `/speckit.clarify`)

1. **Nivel de autorización sin transient storage.** `onchain-modules.md` propone marcar en
   transient storage qué firmantes validaron. En un bundle con dos UserOps de la misma cuenta,
   EntryPoint valida ambas antes de ejecutar y la segunda sobreescribe la marca. Aquí el nivel
   se deriva de la propia UserOp en `executeUserOp` (nonce key + prefijo de firma).
2. **Prefijo de firma explícito** (`0x00` simple, `0x01` compuesta). Sin él, una firma de
   passkey cuyo primer byte sea `0x01` se interpretaría como compuesta (~1 de cada 256 credenciales).
3. **Selectores que solo endurecen.** `setLimit`, `removeAllowlist`, `cancelPending`,
   `cancel` y `revokeSession` se aceptan con passkey sola; el resto de llamadas a módulos exige MPC.
   Así "endurecer es inmediato" y el titular puede cancelar una recuperación con su passkey.
4. **El hook recibe el nivel** (`checkExecution`) en lugar del `preCheck` estándar de ERC-7579,
   que no puede saber quién firmó. Si se adopta un módulo de terceros, hay que adaptar esto.
5. **El enclave verifica la aserción de passkey** sobre `messageHash` antes de participar,
   no solo la aprobación del API. Un backend comprometido no puede usar S para co-firmar algo
   que el usuario no aprobó (refuerza T4).
6. **FR-013 provisional**: límite en unidades de token, sin oráculo.

## Limitación honesta que el threat model debe recoger
La llave MPC es la llave raíz del EOA: con D + S puede firmar una nueva autorización 7702 y
saltarse hook y timelocks. El contrato protege contra quien solo tiene la passkey (T1–T3).
Contra D + S comprometidos protege el **servidor**: `evaluateCosign` se niega a co-firmar
cambios administrativos sin un aviso previo de 48 h. Añadir como T14 en `threat-model.md`.

## Contrato API añadido (actualizar backend-api.openapi.yaml)
`POST /auth/refresh`, `GET /accounts/:id`, `POST /accounts`, `PUT /accounts/:id/guardians`,
`DELETE /policies/:id/pending`, `GET /session-keys`, y el campo `attestationNonce` en `/mpc/sessions`.
Faltan los workers que consumen `jobs:*` (activar red, habilitar/revocar session keys,
notificar guardianes) y el indexador de saldos (T065).

## Pendiente antes de mainnet (además de T110–T118)
- ERC-7739 en `isValidSignature` (replay entre cuentas que comparten passkey).
- Validadores deben devolver `SIG_VALIDATION_FAILED` en vez de revertir con firmas mal formadas.
- Paymaster ERC-20 con oráculo y límites de precio.
- SessionKeyValidator: preferir Smart Sessions auditado (research R7).
- Handlers de invariantes completos para los 5 invariantes.
