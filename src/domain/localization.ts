/** Register a language here and provide its complete UI dictionary in i18n. */
export const localeCatalog = {
  ru: { label: "Русский", tag: "ru-RU" },
  en: { label: "English", tag: "en-GB" },
} as const;

export type Locale = keyof typeof localeCatalog;
export const localeCodes = Object.keys(localeCatalog) as Locale[];
export const defaultLocale: Locale = "ru";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(localeCatalog, value);
}

/** New UI languages can use existing campus packages without blank labels. */
export function localize(
  value: Readonly<Record<string, string>> | null | undefined,
  locale: string,
): string {
  return (
    value?.[locale]?.trim() || value?.en?.trim() || value?.ru?.trim() || ""
  );
}
