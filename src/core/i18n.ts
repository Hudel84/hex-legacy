import en from '../i18n/en.json';
import de from '../i18n/de.json';
import { settings, saveSettings, type Lang } from './settings';

const tables: Record<Lang, Record<string, string>> = { en, de };

/** Translate a key. English is the fallback; missing keys show as [key]. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = tables[settings.lang][key] ?? tables.en[key] ?? `[${key}]`;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function setLang(lang: Lang): void {
  settings.lang = lang;
  saveSettings();
}
