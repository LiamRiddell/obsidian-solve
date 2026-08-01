import { enLocale, type ILocale } from "./en";
import { deLocale } from "./de";
import { frLocale } from "./fr";

const locales: Record<string, ILocale> = {
  en: enLocale,
  de: deLocale,
  fr: frLocale,
};

export function getLocale(code: string): ILocale {
  return locales[code] || enLocale;
}

export function registerLocale(code: string, locale: ILocale): void {
  locales[code] = locale;
}

export { enLocale, deLocale, frLocale, type ILocale };