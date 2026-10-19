import { Preferences } from "@capacitor/preferences";
import type { Locale } from "../domain/types";
import { defaultLocale, isLocale } from "../domain/localization";
export interface PreferencesState {
  locale: Locale;
  theme: "light" | "dark" | "system";
  favorites: string[];
}
export const defaultPreferences: PreferencesState = {
  locale: defaultLocale,
  theme: "light",
  favorites: [],
};
export async function loadPreferences(): Promise<PreferencesState> {
  try {
    const { value } = await Preferences.get({ key: "kubsu.preferences.v1" });
    if (!value) return defaultPreferences;
    const p = JSON.parse(value);
    return {
      locale: isLocale(p.locale) ? p.locale : defaultLocale,
      theme: ["light", "dark", "system"].includes(p.theme) ? p.theme : "light",
      favorites: Array.isArray(p.favorites)
        ? p.favorites.filter((x: unknown) => typeof x === "string")
        : [],
    };
  } catch {
    return defaultPreferences;
  }
}
export async function savePreferences(value: PreferencesState) {
  await Preferences.set({
    key: "kubsu.preferences.v1",
    value: JSON.stringify(value),
  });
}
