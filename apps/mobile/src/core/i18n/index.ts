import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import es from './es-CO.json';
import en from './en.json';

// FR-023: español (es-CO) por defecto; inglés con respaldo a español para claves faltantes.
const lang = getLocales()[0]?.languageCode === 'en' ? 'en' : 'es-CO';

void i18n.use(initReactI18next).init({
  resources: { 'es-CO': { translation: es }, en: { translation: en } },
  lng: lang,
  fallbackLng: 'es-CO',
  interpolation: { escapeValue: false },
});

export default i18n;
