import { enLocale, type ILocale } from "./en";

const locales: Record<string, ILocale> = {
  en: enLocale,
};

export function getLocale(code: string): ILocale {
  return locales[code] || enLocale;
}

export function registerLocale(code: string, locale: ILocale): void {
  locales[code] = locale;
}

export type { ILocale } from "./en";
export { enLocale } from "./en";