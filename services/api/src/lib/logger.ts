import pino from 'pino';

/** Constitución VII / T020: redacción obligatoria. Rutas comodín para cualquier profundidad conocida. */
export const REDACT_PATHS = [
  '*.share', '*.shareD', '*.shareB', '*.shareS', '*.keyShare', '*.payload', '*.prfOutput',
  '*.privateKey', '*.mnemonic', '*.otp', '*.code', '*.stepUpToken', '*.refreshToken', '*.accessToken',
  '*.clientDataJSON', '*.authenticatorData', '*.attestationObject', 'req.headers.authorization', 'req.headers.cookie',
];

export const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[redactado]' } });

/** T036: patrones que nunca deben aparecer en un log. Usado por el test de no-filtración. */
const SECRET_PATTERNS = [
  /\b(0x)?[0-9a-fA-F]{64}\b/, // escalares de 32 bytes (partes, llaves)
  /"(share[DBS]?|keyShare|prfOutput|privateKey)"\s*:\s*"(?!\[redactado\])/,
  /\b\d{6}\b(?=.*otp)/i,
];

export function findSecrets(line: string): string[] {
  return SECRET_PATTERNS.filter((p) => p.test(line)).map((p) => p.source);
}
