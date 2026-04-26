import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';

const SUPPORTED_LOCALES = ['en', 'zh', 'ja', 'ko'] as const;

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
type TranslationResource = Record<string, unknown>;
type TranslationModule = {default: TranslationResource} | TranslationResource;
const loadedLocales = new Set<SupportedLocale>();
const stagedResources: Partial<Record<SupportedLocale, {translation: TranslationResource}>> = {};

const localeLoaders: Record<SupportedLocale, () => Promise<TranslationModule>> = {
  en: () => import('./locales/en.json'),
  zh: () => import('./locales/zh.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
};

function normalizeLocaleCode(lang: string | undefined): SupportedLocale {
  const locale = (lang || 'en').toLowerCase();
  if (locale.startsWith('zh')) return 'zh';
  if (locale.startsWith('ja')) return 'ja';
  if (locale.startsWith('ko')) return 'ko';
  return 'en';
}

function detectInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const storedLocale = window.localStorage.getItem('i18nextLng');
  if (storedLocale) {
    return normalizeLocaleCode(storedLocale);
  }

  return normalizeLocaleCode(window.navigator.language);
}

function persistLocale(locale: SupportedLocale) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem('i18nextLng', locale);
  document.documentElement.lang = locale;
}

async function loadLocale(locale: SupportedLocale) {
  if (loadedLocales.has(locale) || (initialized && i18n.hasResourceBundle(locale, 'translation'))) {
    return;
  }

  const loadedModule = await localeLoaders[locale]();
  const translation: TranslationResource = 'default' in loadedModule
    ? (loadedModule.default as TranslationResource)
    : (loadedModule as TranslationResource);
  if (initialized) {
    i18n.addResourceBundle(locale, 'translation', translation, true, true);
  } else {
    stagedResources[locale] = {translation};
  }
  loadedLocales.add(locale);
}

let initialized = false;

export async function initI18n() {
  if (initialized) {
    return i18n;
  }

  const initialLocale = detectInitialLocale();
  const preloadLocales = initialLocale === 'en' ? ['en'] : [initialLocale, 'en'];
  await Promise.all(preloadLocales.map((locale) => loadLocale(locale as SupportedLocale)));

  await i18n
    .use(initReactI18next)
    .init({
      lng: initialLocale,
      resources: stagedResources,
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LOCALES,
      interpolation: {
        escapeValue: false,
      },
    });

  persistLocale(initialLocale);
  initialized = true;
  return i18n;
}

export async function changeAppLanguage(locale: string) {
  const normalizedLocale = normalizeLocaleCode(locale);
  await loadLocale(normalizedLocale);
  await i18n.changeLanguage(normalizedLocale);
  persistLocale(normalizedLocale);
}

export default i18n;
