import { enLocale, type ILocale } from "./en";
import { deLocale } from "./de";

const locales: Record<string, ILocale> = {
  en: enLocale,
  de: deLocale,
};

export function getLocale(code: string): ILocale {
  return locales[code] || enLocale;
}

export function registerLocale(code: string, locale: ILocale): void {
  locales[code] = locale;
}

export { enLocale, deLocale, type ILocale };