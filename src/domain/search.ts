import type { Category, Locale, Place } from "./types";
import { defaultLocale, localeCatalog, localize } from "./localization";
export function normalize(value: string): string {
  const equivalents: Record<string, string> = {
    а: "a",
    н: "n",
    h: "n",
    с: "s",
    c: "s",
    л: "l",
    к: "k",
    б: "b",
    в: "v",
    ё: "е",
  };
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/аудитория|ауд\.|room/g, "")
    .replace(/[анhсcлкбвё]/g, (c) => equivalents[c])
    .replace(/[\s._-]/g, "");
}
export function searchPlaces(
  places: Place[],
  query: string,
  options: {
    category?: Category;
    floor?: number;
    buildingId?: string;
    locale?: Locale;
    limit?: number;
  } = {},
): Place[] {
  const needle = normalize(query),
    terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return places
    .filter(
      (p) =>
        p.searchable !== false &&
        (!options.category || p.category === options.category) &&
        (options.floor === undefined || p.floor === options.floor) &&
        (!options.buildingId || p.buildingId === options.buildingId),
    )
    .map((p) => {
      const names = [...Object.values(p.name), ...p.aliases].map(normalize);
      const text = [...Object.values(p.name), ...Object.values(p.description)]
        .join(" ")
        .toLowerCase();
      const score = !needle
        ? 1
        : names.includes(needle)
          ? 100
          : names.some((n) => n.startsWith(needle))
            ? 60
            : names.some((n) => n.includes(needle))
              ? 30
              : terms.every((t) => text.includes(t))
                ? 10
                : 0;
      return { p, score };
    })
    .filter((v) => v.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        localize(a.p.name, options.locale ?? defaultLocale).localeCompare(
          localize(b.p.name, options.locale ?? defaultLocale),
          localeCatalog[options.locale ?? defaultLocale].tag,
          { numeric: true },
        ),
    )
    .slice(0, options.limit ?? 100)
    .map((v) => v.p);
}
