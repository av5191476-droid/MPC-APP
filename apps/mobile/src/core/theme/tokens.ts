/** Mismos tokens que el showcase. Cada firmante tiene su color en toda la app. */
export const palette = {
  light: {
    paper: '#E9ECE6', surface: '#FFFFFF', sunk: '#F3F5F1', ink: '#15212A', muted: '#56666E', line: '#CDD4CE',
    passkey: '#0F7B6C', device: '#2C55B0', server: '#A86A12', backup: '#74489F', bad: '#BD2F45', good: '#0F7B6C',
  },
  dark: {
    paper: '#0D1418', surface: '#151F25', sunk: '#1B262D', ink: '#E3EAEC', muted: '#93A3AA', line: '#2A3740',
    passkey: '#3DBBA6', device: '#7B9EF0', server: '#E0A64B', backup: '#B48BE0', bad: '#F06A7E', good: '#3DBBA6',
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };

export const type = {
  family: 'SchibstedGrotesk', // cargada con expo-font; fallback del sistema
  mono: 'IBMPlexMono',
  display: { fontSize: 32, lineHeight: 36, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.4 },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 13.5, lineHeight: 19 },
  money: { fontSize: 44, lineHeight: 48, fontWeight: '700' as const, letterSpacing: -1.4 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 } as const;
export const radius = { field: 14, button: 16, card: 18, pill: 999 } as const;
/** Constitución VIII: objetivos táctiles ≥ 44 px. */
export const MIN_TOUCH = 48;
