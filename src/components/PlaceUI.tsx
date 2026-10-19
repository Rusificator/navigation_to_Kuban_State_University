import {
  Accessibility,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  BedDouble,
  Building2,
  ChevronRight,
  Coffee,
  DoorOpen,
  Flag,
  GraduationCap,
  Heart,
  Landmark,
  MapPin,
  PersonStanding,
  Search,
  SlidersHorizontal,
  Toilet,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CampusPackage,
  Category,
  Locale,
  Place,
  RouteStep,
} from "../domain/types";
import { searchPlaces } from "../domain/search";
import { localize } from "../domain/localization";
import { translate } from "../i18n";

export function CategoryIcon({
  category,
  size = 20,
}: {
  category: Category;
  size?: number;
}) {
  const Icons = {
    room: GraduationCap,
    entrance: DoorOpen,
    food: Coffee,
    library: BookOpen,
    museum: Landmark,
    sport: Waves,
    toilet: Toilet,
    stairs: ArrowUp,
    office: Building2,
    building: Building2,
    landmark: Landmark,
    dormitory: BedDouble,
  };
  const Icon = Icons[category] || MapPin;
  return <Icon size={size} strokeWidth={1.8} />;
}
export function StepIcon({ step }: { step: RouteStep }) {
  const Icon = {
    start: PersonStanding,
    straight: ArrowUp,
    left: ArrowLeft,
    right: ArrowRight,
    stairsUp: ArrowUp,
    stairsDown: ArrowDown,
    lift: Accessibility,
    arrive: Flag,
    passage: DoorOpen,
  }[step.kind];
  return <Icon size={22} />;
}
export function PlaceRow({
  place,
  campus,
  locale,
  onClick,
  favorite,
}: {
  place: Place;
  campus: CampusPackage;
  locale: Locale;
  onClick: () => void;
  favorite?: boolean;
}) {
  const t = translate(locale),
    b = campus.buildings.find((b) => b.id === place.buildingId);
  return (
    <button className="place-row" onClick={onClick}>
      <span className={`place-icon cat-${place.category}`}>
        <CategoryIcon category={place.category} />
      </span>
      <span className="place-row-copy">
        <strong>{localize(place.name, locale)}</strong>
        <small>
          {place.environment === "outdoor"
            ? t("territory")
            : localize(b?.name, locale)}
          {place.category !== "building" && place.floor !== null
            ? ` · ${place.floor} ${t("floor")}`
            : ""}
        </small>
      </span>
      {favorite ? (
        <Heart size={16} className="saved-heart" fill="currentColor" />
      ) : (
        <ChevronRight size={17} className="row-chevron" />
      )}
    </button>
  );
}
export function SearchDialog({
  campus,
  locale,
  title,
  onSelect,
  onClose,
  initialCategory,
}: {
  campus: CampusPackage;
  locale: Locale;
  title: string;
  onSelect: (p: Place) => void;
  onClose: () => void;
  initialCategory?: Category;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<Category | undefined>(initialCategory),
    [floor, setFloor] = useState<number | undefined>(),
    [building, setBuilding] = useState("");
  const input = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDivElement>(null);
  const t = translate(locale);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    input.current?.focus();
    return () => previous?.focus();
  }, []);
  const results = searchPlaces(campus.places, query, {
    category,
    floor,
    buildingId: building || undefined,
    locale,
    limit: 150,
  });
  const chips: [
    Category,
    (
      | "rooms"
      | "food"
      | "library"
      | "entrances"
      | "buildings"
      | "museums"
      | "sport"
      | "dormitories"
      | "landmarks"
    ),
  ][] = [
    ["room", "rooms"],
    ["building", "buildings"],
    ["entrance", "entrances"],
    ["food", "food"],
    ["library", "library"],
    ["museum", "museums"],
    ["sport", "sport"],
    ["dormitory", "dormitories"],
    ["landmark", "landmarks"],
  ];
  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialog}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const focusable = dialog.current?.querySelectorAll<HTMLElement>(
              'button,input,select,[tabindex="0"]',
            );
            if (!focusable?.length) return;
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label={t("close")}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <div className="search-input">
          <Search size={21} />
          <input
            ref={input}
            placeholder={t("searchHint")}
            value={query}
            aria-label={t("searchAll")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="icon-button"
              onClick={() => setQuery("")}
              aria-label={t("close")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="filter-chips">
          <button
            className={!category ? "active" : ""}
            onClick={() => setCategory(undefined)}
          >
            {t("all")}
          </button>
          {chips.map(([cat, key]) => (
            <button
              className={category === cat ? "active" : ""}
              key={cat}
              onClick={() => setCategory(cat)}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <div className="search-filters">
          <SlidersHorizontal size={17} />
          <select
            aria-label={t("building")}
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
          >
            <option value="">
              {t("buildings")}: {t("all")}
            </option>
            {campus.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {localize(b.name, locale)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("chooseFloor")}
            value={floor ?? ""}
            onChange={(e) =>
              setFloor(e.target.value ? +e.target.value : undefined)
            }
          >
            <option value="">
              {t("floor")}: {t("all")}
            </option>
            {campus.floors.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="search-results">
          <p className="eyebrow">
            {t("results")} · {results.length === 150 ? "150+" : results.length}
          </p>
          {results.map((p) => (
            <PlaceRow
              key={p.id}
              place={p}
              campus={campus}
              locale={locale}
              onClick={() => onSelect(p)}
            />
          ))}
          {!results.length && (
            <div className="empty-state">
              <Search size={34} />
              <h3>{t("empty")}</h3>
              <p>{t("emptyHint")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
