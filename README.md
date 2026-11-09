# MPC-APP
wallet de computacion multipartita


# Hybrid Wallet — Paquete SDD (GitHub Spec Kit)

App móvil de cripto **no custodial** con modelo de firma **híbrido**:

- **Passkeys (WebAuthn P-256)**: el firmante diario, sin frase semilla.
- **MPC-TSS 2-de-3 (ECDSA secp256k1)**: llave del EOA repartida entre dispositivo, servidor (enclave) y respaldo cifrado del usuario.
- **Smart account (ERC-4337 + EIP-7702 + módulos ERC-7579)**: políticas on-chain, gas patrocinado, recuperación y session keys.

Stack objetivo: React Native (Expo) · EVM L2 (Base, Arbitrum, Polygon PoS) · Foundry · TypeScript (Fastify) · Rust (nodo MPC en AWS Nitro Enclaves) · PostgreSQL.

## Estructura (convención Spec Kit)

```
.specify/
  memory/constitution.md          ← principios no negociables (/speckit.constitution)
  templates/                      ← los genera `specify init`
specs/001-hybrid-wallet/
  spec.md                         ← QUÉ y POR QUÉ (/speckit.specify + /speckit.clarify)
  plan.md                         ← CÓMO: arquitectura y stack (/speckit.plan)
  research.md                     ← decisiones y alternativas (fase 0 del plan)
  data-model.md                   ← entidades y estados (fase 1 del plan)
  contracts/
    backend-api.openapi.yaml      ← API del backend
    onchain-modules.md            ← interfaces de módulos de la smart account
    mpc-protocol.md               ← mensajes y ceremonia MPC
  quickstart.md                   ← escenarios de validación end-to-end
  tasks.md                        ← tareas ordenadas por historia (/speckit.tasks)
  checklists/
    security.md                   ← "unit tests" de los requisitos (/speckit.checklist)
    requirements.md
docs/threat-model.md              ← modelo de amenazas STRIDE (exigido por la constitución)
```

## Cómo usarlo con Spec Kit

```bash
# 1. Instalar e inicializar (requiere uv y git)
uvx --from git+https://github.com/github/spec-kit.git specify init hybrid-wallet --ai claude
cd hybrid-wallet

# 2. Copiar este paquete encima del proyecto generado
cp -r ../hybrid-wallet-sdd/.specify ../hybrid-wallet-sdd/specs ../hybrid-wallet-sdd/docs .
```

Luego, en tu agente (Claude Code, Copilot, Cursor…), el flujo SDD es:

| Paso | Comando | Qué hacer con este paquete |
|---|---|---|
| 1 | `/speckit.constitution` | Ya está escrita. Pídele que la valide y ajuste la versión. |
| 2 | `/speckit.specify` | Ya está `spec.md`. Úsalo para nuevas features (002, 003…). |
| 3 | `/speckit.clarify` | Resuelve los `[NEEDS CLARIFICATION]` que quedan en `spec.md`. |
| 4 | `/speckit.plan` | `plan.md` + artefactos de fase 0/1 ya están; regénéralos si cambias el stack. |
| 5 | `/speckit.checklist` | Revisa `checklists/` antes de implementar. |
| 6 | `/speckit.tasks` | `tasks.md` ya está desglosado (T001–T118). |
| 7 | `/speckit.analyze` | Ejecútalo: verifica coherencia constitución ↔ spec ↔ plan ↔ tasks. |
| 8 | `/speckit.implement` | Implementa por fases; MVP = Fase 1 + 2 + 3 (US1). |

### Prompts listos (si quieres regenerar desde cero)

```text
/speckit.specify Billetera móvil no custodial para LATAM. El usuario crea su cuenta con una
passkey (Face ID/huella), sin frase semilla. La llave de firma es un EOA generado por MPC 2-de-3
(dispositivo, servidor en enclave, respaldo cifrado en iCloud/Google Drive) y convertido en smart
account con EIP-7702. Puede recibir y enviar USDC/ETH en Base, Arbitrum y Polygon con gas
patrocinado o pagado en USDC, definir límites de gasto, exigir doble firma (passkey + MPC) para
montos altos, recuperar la cuenta si pierde el teléfono y conectar dApps vía WalletConnect con
session keys acotadas.

/speckit.plan Expo (React Native) + TypeScript; módulo nativo Rust (uniffi) con DKLs23 para MPC;
react-native-passkey; viem + permissionless.js; contratos Foundry sobre ERC-7579 (validador WebAuthn
con precompile RIP-7212, módulo de políticas, recuperación con guardianes y timelock); EntryPoint
v0.8; backend Fastify + PostgreSQL + Redis; nodo MPC en Rust dentro de AWS Nitro Enclaves con KMS;
bundler y paymaster detrás de una interfaz intercambiable (Pimlico/Alchemy/self-hosted).
```

> Aviso: esto es una especificación de ingeniería, no asesoría legal ni de cumplimiento. Antes de
> producción se requieren auditoría externa de contratos y de la implementación MPC, y revisión
> regulatoria por país (ver `spec.md` › Cumplimiento).

