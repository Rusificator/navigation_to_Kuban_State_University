import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import {
  Accessibility,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  Coffee,
  Compass,
  Download,
  ExternalLink,
  Flag,
  Globe2,
  Heart,
  Info,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Moon,
  Navigation,
  Plus,
  Route as RouteIcon,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Sun,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { defaultCampus, validateCampus } from "./data/repository";
import { Router } from "./domain/router";
import { localeCatalog, localeCodes, localize } from "./domain/localization";
import type { Fix } from "./domain/location";
import type {
  CampusPackage,
  Category,
  Place,
  RouteProfile,
  RouteResult,
} from "./domain/types";
import { stepLabel, translate } from "./i18n";
import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from "./platform/preferences";
import { exportText } from "./platform/export";
import { ReportDialog } from "./components/ReportDialog";
import { ForegroundLocation } from "./platform/geolocation";
import { Map2D } from "./components/Map2D";
const Map3D = lazy(() =>
  import("./components/Map3D").then((module) => ({ default: module.Map3D })),
);
import {
  OutdoorMap,
  isOnCampus,
  projectOutdoor,
} from "./components/OutdoorMap";
import type { MapHandle } from "./components/map-types";
import {
  CategoryIcon,
  PlaceRow,
  SearchDialog,
  StepIcon,
} from "./components/PlaceUI";

type Tab = "map" | "route" | "saved" | "settings";
export default function App() {
  const [campus, setCampus] = useState<CampusPackage>(defaultCampus);
  const [preferences, setPreferences] = useState(defaultPreferences),
    [preferencesReady, setPreferencesReady] = useState(false);
  const [tab, setTab] = useState<Tab>("map"),
    [floor, setFloor] = useState(1),
    [mode, setMode] = useState<"2d" | "3d">("3d");
  const [overview, setOverview] = useState(true),
    [exploded, setExploded] = useState(false),
    [outdoor, setOutdoor] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null),
    [search, setSearch] = useState<{
      target: "place" | "from" | "to";
      category?: Category;
    } | null>(null);
  const [from, setFrom] = useState<Place | null>(null),
    [to, setTo] = useState<Place | null>(null),
    [profile, setProfile] = useState<RouteProfile>("walking");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null),
    [navigating, setNavigating] = useState(false),
    [step, setStep] = useState(0);
  const [toast, setToast] = useState(""),
    [fix, setFix] = useState<Fix | null>(null),
    [gpsStatus, setGpsStatus] = useState<
      "off" | "waiting" | "ready" | "denied" | "unavailable"
    >("off");
  const [locationPanel, setLocationPanel] = useState(false),
    [report, setReport] = useState(false);
  const [clock, setClock] = useState(Date.now()),
    [systemDark, setSystemDark] = useState(
      matchMedia("(prefers-color-scheme: dark)").matches,
    );
  const map = useRef<MapHandle>(null),
    location = useRef(new ForegroundLocation()),
    fileInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale = preferences.locale,
    t = translate(locale),
    dark =
      preferences.theme === "dark" ||
      (preferences.theme === "system" && systemDark);
  const router = useMemo(() => new Router(campus), [campus]);
  const route = routeResult?.ok ? routeResult.route : null;
  const currentStep = navigating ? route?.steps[step] : undefined;
  const hasOutdoor = campus === defaultCampus;
  const gpsActive = gpsStatus === "waiting" || gpsStatus === "ready";
  const favoriteKey = (place: Place) => `${campus.id}:${place.id}`;
  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);
  useEffect(() => {
    loadPreferences().then((p) => {
      setPreferences(p);
      setPreferencesReady(true);
    });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  useEffect(() => {
    if (preferencesReady)
      void savePreferences(preferences).catch(() => undefined);
  }, [preferences, preferencesReady]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = locale;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#14221f" : "#f4f7f4");
  }, [dark, locale]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    const pause = () => {
      if (document.hidden) {
        void location.current.stop();
        setGpsStatus("off");
        setFix(null);
      }
    };
    document.addEventListener("visibilitychange", pause);
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform())
      NativeApp.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          void location.current.stop();
          setGpsStatus("off");
          setFix(null);
        }
      }).then((h) => {
        if (disposed) void h.remove();
        else remove = () => h.remove();
      });
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pause);
      void location.current.stop();
      void remove?.();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const selectPlace = useCallback((p: Place) => {
    setSelected(p);
    if (p.floor !== null) setFloor(p.floor);
    setOutdoor(false);
    if (p.environment === "outdoor") setOverview(true);
    else if (p.category !== "building") setOverview(false);
    setTab("map");
  }, []);
  useEffect(() => {
    const parse = (url: string) => {
      try {
        const u = new URL(url);
        const id =
          u.searchParams.get("place") ||
          new URLSearchParams(u.hash.slice(1)).get("place");
        const requestedCampus = u.searchParams.get("campus");
        if (requestedCampus && requestedCampus !== campus.id) return;
        const p = campus.places.find((p) => p.id === id);
        if (p) selectPlace(p);
      } catch {}
    };
    parse(locationHref());
    const hash = () => parse(locationHref());
    window.addEventListener("hashchange", hash);
    let disposed = false,
      remove: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform()) {
      void NativeApp.getLaunchUrl()
        .then((result) => {
          if (result && !disposed) parse(result.url);
        })
        .catch(() => undefined);
      NativeApp.addListener("appUrlOpen", ({ url }) => parse(url)).then((h) => {
        if (disposed) void h.remove();
        else remove = () => h.remove();
      });
    }
    return () => {
      disposed = true;
      window.removeEventListener("hashchange", hash);
      void remove?.();
    };
  }, [campus, selectPlace]);
  useEffect(() => {
    if (currentStep) {
      setFloor(currentStep.floor);
      setOutdoor(false);
      setOverview(false);
      const n = router.nodes.get(currentStep.nodeId);
      if (n) map.current?.focus(n);
    }
  }, [currentStep?.id, router]);
  useEffect(() => {
    const handle = () => {
      if (search) {
        setSearch(null);
        return;
      }
      if (report) {
        setReport(false);
        return;
      }
      if (selected) {
        setSelected(null);
        return;
      }
      if (tab !== "map") {
        setTab("map");
        return;
      }
      void NativeApp.minimizeApp();
    };
    let disposed = false,
      remove: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform())
      NativeApp.addListener("backButton", handle).then((h) => {
        if (disposed) void h.remove();
        else remove = () => h.remove();
      });
    return () => {
      disposed = true;
      void remove?.();
    };
  }, [search, report, selected, tab]);
  const clearRoute = () => {
    setRouteResult(null);
    setNavigating(false);
    setStep(0);
  };
  const chooseRoutePoint = (p: Place, target: "from" | "to") => {
    clearRoute();
    if (target === "from") setFrom(p);
    else setTo(p);
    setSelected(null);
    setSearch(null);
    setTab("route");
  };
  const buildRoute = () => {
    if (!from || !to) return;
    const result = router.find(from.nodeIds, to.nodeIds, profile);
    setRouteResult(result);
    setNavigating(false);
    setStep(0);
    setOutdoor(false);
    setSelected(null);
    if (result.ok) {
      setFloor(router.nodes.get(result.route.nodeIds[0])!.floor);
      setOverview(false);
      setMode("2d");
      setTimeout(
        () => map.current?.focus(router.nodes.get(result.route.nodeIds[0])!),
        0,
      );
    }
  };
  const toggleFavorite = (p: Place) =>
    setPreferences((prev) => ({
      ...prev,
      favorites: prev.favorites.includes(favoriteKey(p))
        ? prev.favorites.filter((id) => id !== favoriteKey(p))
        : [...prev.favorites, favoriteKey(p)],
    }));
  const startGps = async () => {
    setLocationPanel(true);
    setGpsStatus("waiting");
    setFix(null);
    await location.current.start(
      (p) => {
        setFix(p);
        setGpsStatus("ready");
      },
      (code) => {
        setGpsStatus(code);
        setFix(null);
      },
    );
  };
  const stopGps = () => {
    void location.current.stop();
    setGpsStatus("off");
    setFix(null);
  };
  const gpsMessage = () => {
    if (gpsStatus === "off") return t("gpsOff");
    if (gpsStatus === "waiting") return t("gpsWaiting");
    if (gpsStatus === "denied") return t("gpsDenied");
    if (gpsStatus === "unavailable") return t("gpsError");
    if (!fix || clock - fix.timestamp > 15000) return t("gpsStale");
    if (fix.accuracy > 35) return t("gpsWeak");
    if (hasOutdoor && !isOnCampus(fix)) return t("gpsOutside");
    if (outdoor) return t("gpsGood");
    return t("gpsUncalibrated");
  };
  const sharePlace = async (p: Place) => {
    const location =
      p.environment === "outdoor"
        ? t("territory")
        : `${localize(campus.buildings.find((b) => b.id === p.buildingId)?.name, locale)}${p.category !== "building" && p.floor !== null ? ` · ${p.floor} ${t("floor")}` : ""}`;
    const text = `${localize(p.name, locale)} · ${location}\n${localize(campus.address, locale)}\nkubsu-next://place?campus=${encodeURIComponent(campus.id)}&place=${encodeURIComponent(p.id)}`;
    try {
      if (Capacitor.isNativePlatform())
        await Share.share({ title: localize(p.name, locale), text });
      else if (navigator.share)
        await navigator.share({ title: localize(p.name, locale), text });
      else {
        await navigator.clipboard.writeText(text);
        notify(t("shared"));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        void exportText("kubsu-place.txt", text, "text/plain");
    }
  };
  const loadPackage = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error("Size");
      const next = validateCampus(JSON.parse(await file.text()));
      setCampus(next);
      setFrom(null);
      setTo(null);
      setSelected(null);
      clearRoute();
      setFloor(next.floors[0]);
      setOutdoor(false);
      notify(t("imported"));
    } catch {
      notify(t("badPackage"));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const popular = useMemo(
    () =>
      ["rect10827", "rect11205", "rect10619", "building-lib"]
        .map((id) => campus.places.find((p) => p.id === id))
        .filter((p): p is Place => !!p),
    [campus],
  );
  const favoritePlaces = campus.places.filter((p) =>
    preferences.favorites.includes(favoriteKey(p)),
  );
  const navItems: { id: Tab; label: string; icon: typeof MapIcon }[] = [
    { id: "map", label: t("home"), icon: MapIcon },
    { id: "route", label: t("route"), icon: RouteIcon },
    { id: "saved", label: t("saved"), icon: Heart },
    { id: "settings", label: t("settings"), icon: Settings2 },
  ];
  const navigation = (
    <>
      {navItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={tab === id ? "nav-item active" : "nav-item"}
          aria-label={label}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => {
            setTab(id);
            if (id !== "map") setSelected(null);
          }}
        >
          <Icon size={21} />
          <span>{label}</span>
          {id === "saved" && favoritePlaces.length > 0 && (
            <i aria-hidden="true">{favoritePlaces.length}</i>
          )}
        </button>
      ))}
    </>
  );
  return (
    <div className={`app-shell tab-${tab}`}>
      <aside className="sidebar">
        <header className="brand">
          <span className="brand-symbol">
            <Navigation size={26} fill="currentColor" />
          </span>
          <span>
            <strong>{t("brand")}</strong>
            <small>{t("navigator")}</small>
          </span>
          <span className="brand-label">CAMPUS</span>
        </header>
        <div className="sidebar-scroll">
          {tab === "map" && !selected && (
            <>
              <div className="intro">
                <p className="eyebrow">
                  <span className="live-dot" />
                  {t("city")} · {t("campus")}
                </p>
                <h1>
                  {t("hello")}
                  <br />
                  <em>{t("hero")}</em>
                </h1>
                <p>{t("intro")}</p>
              </div>
              <button
                className="search-launch"
                onClick={() => setSearch({ target: "place" })}
              >
                <Search size={21} />
                <span>{t("search")}</span>
                <span className="search-key">⌕</span>
              </button>
              <section className="quick-section">
                <h2>{t("quick")}</h2>
                <div className="quick-grid">
                  {(
                    [
                      ["room", "rooms"],
                      ["food", "food"],
                      ["library", "library"],
                      ["entrance", "entrances"],
                      ["sport", "sport"],
                      ["dormitory", "dormitories"],
                    ] as const
                  ).map(([cat, key]) => (
                    <button
                      key={cat}
                      onClick={() =>
                        setSearch({ target: "place", category: cat })
                      }
                    >
                      <span className={`quick-icon cat-${cat}`}>
                        <CategoryIcon category={cat} size={23} />
                      </span>
                      <span>{t(key)}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="explore-section">
                <div className="section-title">
                  <div>
                    <h2>{t("explore")}</h2>
                    <p>{t("exploreSub")}</p>
                  </div>
                  <button
                    aria-label={t("buildings")}
                    className="icon-button"
                    onClick={() =>
                      setSearch({ target: "place", category: "building" })
                    }
                  >
                    <ArrowUpRight size={21} />
                  </button>
                </div>
                <div
                  className="campus-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setOverview(true);
                    setMode("3d");
                    setOutdoor(false);
                    setTimeout(() => map.current?.reset(), 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setOverview(true);
                      setMode("3d");
                      setOutdoor(false);
                    }
                  }}
                >
                  <div className="campus-card-top">
                    <span>КУБГУ / KUBSU</span>
                    <Layers3 size={20} />
                  </div>
                  <CampusIllustration />
                  <div className="campus-card-bottom">
                    <span>
                      <strong>{localize(campus.title, locale)}</strong>
                      <small>{localize(campus.address, locale)}</small>
                    </span>
                    <span className="round-arrow">
                      <ArrowUpRight size={21} />
                    </span>
                  </div>
                </div>
              </section>
              <section className="popular-section">
                <div className="section-title">
                  <h2>{t("popular")}</h2>
                  <span>{popular.length.toString().padStart(2, "0")}</span>
                </div>
                {popular.map((p) => (
                  <PlaceRow
                    key={p.id}
                    place={p}
                    campus={campus}
                    locale={locale}
                    onClick={() => selectPlace(p)}
                    favorite={preferences.favorites.includes(favoriteKey(p))}
                  />
                ))}
              </section>
              <div className="offline-card">
                <WifiOff size={18} />
                <span>
                  <strong>{t("offline")}</strong>
                  <small>
                    {campus.places.filter((p) => p.searchable !== false).length}{" "}
                    {t("available")}
                  </small>
                </span>
                <Check size={17} />
              </div>
            </>
          )}
          {tab === "map" && selected && (
            <>
              <button className="text-back" onClick={() => setSelected(null)}>
                <ArrowLeft size={18} />
                {t("back")}
              </button>
              <div className="place-detail">
                <span className={`detail-symbol cat-${selected.category}`}>
                  <CategoryIcon category={selected.category} size={34} />
                </span>
                <p className="eyebrow">{t("openPlace")}</p>
                <h1>{localize(selected.name, locale)}</h1>
                <p className="detail-location">
                  <Building2 size={16} />
                  {selected.environment === "outdoor"
                    ? t("territory")
                    : localize(
                        campus.buildings.find(
                          (b) => b.id === selected.buildingId,
                        )?.name,
                        locale,
                      )}
                  {selected.floor !== null &&
                    selected.category !== "building" && (
                      <>
                        <span>·</span>
                        {selected.floor} {t("floor")}
                      </>
                    )}
                </p>
                <div className="detail-actions">
                  <button
                    className="primary"
                    disabled={!selected.nodeIds.length}
                    onClick={() => {
                      chooseRoutePoint(selected, "to");
                      if (!from)
                        setFrom(
                          campus.places.find((p) => p.id === "rect10827") ??
                            null,
                        );
                    }}
                  >
                    <RouteIcon size={19} />
                    {t("goHere")}
                  </button>
                  <button
                    className={`icon-button favorite-button ${preferences.favorites.includes(favoriteKey(selected)) ? "is-saved" : ""}`}
                    onClick={() => toggleFavorite(selected)}
                    aria-label={
                      preferences.favorites.includes(favoriteKey(selected))
                        ? t("unsave")
                        : t("save")
                    }
                  >
                    <Heart
                      size={21}
                      fill={
                        preferences.favorites.includes(favoriteKey(selected))
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </div>
                <button
                  className="secondary full-width"
                  disabled={!selected.nodeIds.length}
                  onClick={() => chooseRoutePoint(selected, "from")}
                >
                  <MapPin size={18} />
                  {t("startHere")}
                </button>
                {localize(selected.description, locale) ? (
                  <div className="source-description">
                    {campus.id === defaultCampus.id &&
                      selected.source === "apk-1.0.3" &&
                      locale !== "ru" &&
                      selected.description[locale] && (
                        <small>{t("translatedArchive")}</small>
                      )}
                    {!selected.description[locale]?.trim() && (
                      <small>{t("untranslated")}</small>
                    )}
                    <p>{localize(selected.description, locale)}</p>
                  </div>
                ) : null}
                <div className="detail-data">
                  <span>{t("source")}</span>
                  <strong>
                    {selected.source.startsWith("curation-")
                      ? t("curated")
                      : `${localize(campus.source.name, locale)} ${campus.source.version}`}
                  </strong>
                  {selected.floor !== null &&
                    selected.category !== "building" && (
                      <>
                        <span>{t("floor")}</span>
                        <strong>{selected.floor}</strong>
                      </>
                    )}
                  <span>{t("viewing")}</span>
                  <strong>{t("notVerified")}</strong>
                </div>
                {!!selected.evidenceIds?.length && (
                  <div className="place-sources">
                    <h3>{t("sourceLinks")}</h3>
                    <ul>
                      {selected.evidenceIds.map((id) => {
                        const source = campus.evidenceSources?.find(
                          (s) => s.id === id,
                        );
                        if (!source) return null;
                        return (
                          <li key={id}>
                            {source.url ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {localize(source.title, locale)}
                              </a>
                            ) : (
                              localize(source.title, locale)
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {!selected.nodeIds.length && (
                  <p className="notice">
                    <Info size={17} />
                    {t("routeNoPoint")}
                  </p>
                )}
                <button
                  className="link-button"
                  onClick={() => sharePlace(selected)}
                >
                  <Share2 size={18} />
                  {t("share")}
                </button>
                <button className="link-button" onClick={() => setReport(true)}>
                  <Flag size={18} />
                  {t("reportIssue")}
                </button>
              </div>
            </>
          )}
          {tab === "route" && (
            <section
              className={`route-panel ${navigating ? "is-navigating" : ""}`}
            >
              <p className="eyebrow">{t("campus")}</p>
              <h1>{navigating ? t("following") : t("route")}</h1>
              {navigating && (
                <button
                  className="link-button"
                  onClick={() => setNavigating(false)}
                >
                  {t("editRoute")}
                </button>
              )}
              <div className="route-inputs">
                <button onClick={() => setSearch({ target: "from" })}>
                  <span className="point-dot start-dot" />
                  <span>
                    <small>{t("from")}</small>
                    <strong>
                      {from ? localize(from.name, locale) : t("chooseStart")}
                    </strong>
                  </span>
                </button>
                <i className="point-connector" />
                <button onClick={() => setSearch({ target: "to" })}>
                  <span className="point-dot end-dot" />
                  <span>
                    <small>{t("to")}</small>
                    <strong>
                      {to ? localize(to.name, locale) : t("chooseEnd")}
                    </strong>
                  </span>
                </button>
                <button
                  className="swap-points icon-button"
                  aria-label={t("swap")}
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                    clearRoute();
                  }}
                >
                  <ArrowDownUp size={20} />
                </button>
              </div>
              <div className="route-profiles">
                <button
                  className={profile === "walking" ? "active" : ""}
                  onClick={() => {
                    setProfile("walking");
                    clearRoute();
                  }}
                >
                  <Navigation size={16} />
                  {t("walking")}
                </button>
                <button
                  className={profile === "stepFree" ? "active" : ""}
                  onClick={() => {
                    setProfile("stepFree");
                    clearRoute();
                  }}
                >
                  <Accessibility size={17} />
                  {t("stepFree")}
                </button>
              </div>
              <button
                className="primary full-width"
                disabled={!from || !to}
                onClick={buildRoute}
              >
                <RouteIcon size={19} />
                {t("plan")}
                <ArrowRight size={18} />
              </button>
              {routeResult && !routeResult.ok && (
                <div className="route-error" role="status">
                  <Info size={22} />
                  <p>
                    {t(
                      routeResult.reason === "invalid-point"
                        ? "routeNoPoint"
                        : routeResult.reason === "no-route"
                          ? "routeNoPath"
                          : "routeNoAccess",
                    )}
                  </p>
                </div>
              )}
              {!routeResult && (
                <div className="empty-state route-empty">
                  <RouteIcon size={42} />
                  <h3>{t("routeEmpty")}</h3>
                  <p>{t("routeHint")}</p>
                </div>
              )}
              {route && (
                <>
                  <div className="route-summary">
                    <span className="route-summary-icon">
                      <Check size={20} />
                    </span>
                    <div>
                      <h3>
                        {navigating
                          ? `${t("progress")} ${step + 1} ${t("of")} ${route.steps.length}`
                          : t("routeReady")}
                      </h3>
                      <p>
                        {route.steps.length} {t("steps")} <span>·</span>{" "}
                        {route.floors.length} {t("levels")}
                      </p>
                    </div>
                  </div>
                  {navigating && currentStep ? (
                    <div className="guidance">
                      <div className="guidance-header">
                        <span>
                          <StepIcon step={currentStep} />
                        </span>
                        <strong>{stepLabel(currentStep, locale)}</strong>
                      </div>
                      <div className="progress-track">
                        <i
                          style={{
                            width: `${((step + 1) / route.steps.length) * 100}%`,
                          }}
                        />
                      </div>
                      <p>{t("guideManual")}</p>
                      <div className="guidance-buttons">
                        <button
                          className="secondary"
                          disabled={step === 0}
                          onClick={() => setStep((s) => s - 1)}
                          aria-label={t("previous")}
                        >
                          <ArrowLeft size={20} />
                        </button>
                        <button
                          className="primary"
                          onClick={() => {
                            if (step < route.steps.length - 1)
                              setStep((s) => s + 1);
                            else {
                              setNavigating(false);
                              notify(t("navigationComplete"));
                            }
                          }}
                        >
                          {step === route.steps.length - 1
                            ? t("finish")
                            : t("next")}
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="primary full-width start-navigation"
                      onClick={() => {
                        setNavigating(true);
                        setStep(0);
                        setOutdoor(false);
                      }}
                    >
                      <Navigation size={18} />
                      {t("start")}
                    </button>
                  )}
                  <div className="route-step-list">
                    {route.steps.map((s, i) => (
                      <button
                        key={s.id}
                        className={navigating && i === step ? "active" : ""}
                        onClick={() => {
                          setStep(i);
                          setNavigating(true);
                          setFloor(s.floor);
                          setOverview(false);
                          setOutdoor(false);
                          map.current?.focus(router.nodes.get(s.nodeId)!);
                        }}
                      >
                        <span className="step-number">{i + 1}</span>
                        <span>
                          <strong>{stepLabel(s, locale)}</strong>
                          <small>
                            {s.floor} {t("floor")}
                            {s.toFloor !== undefined ? ` → ${s.toFloor}` : ""}
                          </small>
                        </span>
                        {s.toFloor !== undefined ? (
                          <Layers3 size={17} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="notice">
                    <Info size={16} />
                    {t("routeCaution")}
                  </p>
                  <p className="muted small">{t("unscaled")}</p>
                </>
              )}
            </section>
          )}
          {tab === "saved" && (
            <section className="saved-panel">
              <p className="eyebrow">
                {t("brand")} · {t("navigator")}
              </p>
              <h1>
                {t("saved")}
                <span className="heading-count">{favoritePlaces.length}</span>
              </h1>
              {favoritePlaces.length ? (
                favoritePlaces.map((p) => (
                  <PlaceRow
                    key={p.id}
                    place={p}
                    campus={campus}
                    locale={locale}
                    favorite
                    onClick={() => selectPlace(p)}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <Heart size={42} />
                  <h3>{t("savedEmpty")}</h3>
                  <p>{t("savedHint")}</p>
                  <button
                    className="secondary"
                    onClick={() => setSearch({ target: "place" })}
                  >
                    <Search size={17} />
                    {t("searchAll")}
                  </button>
                </div>
              )}
            </section>
          )}
          {tab === "settings" && (
            <section className="settings-panel">
              <p className="eyebrow">
                {t("brand")} · {t("navigator")}
              </p>
              <h1>{t("settings")}</h1>
              <h3>{t("theme")}</h3>
              <div className="theme-picker">
                {(["light", "dark", "system"] as const).map((theme) => (
                  <button
                    className={preferences.theme === theme ? "active" : ""}
                    key={theme}
                    onClick={() => setPreferences((p) => ({ ...p, theme }))}
                  >
                    {theme === "light" ? (
                      <Sun size={23} />
                    ) : theme === "dark" ? (
                      <Moon size={23} />
                    ) : (
                      <Settings2 size={23} />
                    )}
                    <span>{t(theme)}</span>
                  </button>
                ))}
              </div>
              <h3>{t("language")}</h3>
              <div className="language-picker">
                {localeCodes.map((l) => (
                  <button
                    key={l}
                    className={locale === l ? "active" : ""}
                    onClick={() => setPreferences((p) => ({ ...p, locale: l }))}
                  >
                    <Globe2 size={18} />
                    {localeCatalog[l].label}
                    {locale === l && <Check size={17} />}
                  </button>
                ))}
              </div>
              <div className="settings-card">
                <WifiOff size={22} />
                <h3>{t("offline")}</h3>
                <p>{t("offlineHint")}</p>
              </div>
              <div className="settings-card">
                <Layers3 size={22} />
                <h3>{t("data")}</h3>
                <p>
                  {campus === defaultCampus ? t("dataHint") : t("importedHint")}
                </p>
                <dl>
                  <div>
                    <dt>{t("floors")}</dt>
                    <dd>{campus.floors.length}</dd>
                  </div>
                  <div>
                    <dt>{t("buildings")}</dt>
                    <dd>{campus.buildings.length}</dd>
                  </div>
                  <div>
                    <dt>{t("source")}</dt>
                    <dd>{campus.source.version}</dd>
                  </div>
                </dl>
                <button
                  className="secondary full-width"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={17} />
                  {t("import")}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => void loadPackage(e.target.files?.[0])}
                />
                {campus !== defaultCampus && (
                  <button
                    className="link-button"
                    onClick={() => {
                      setCampus(defaultCampus);
                      setSelected(null);
                      setFrom(null);
                      setTo(null);
                      setFloor(1);
                      clearRoute();
                    }}
                  >
                    {t("resetData")}
                  </button>
                )}
              </div>
              <div className="settings-card">
                <ShieldCheck size={23} />
                <h3>{t("location")}</h3>
                <p>{t("privacy")}</p>
                <p>{t("gpsFootnote")}</p>
                <button
                  className="secondary full-width"
                  onClick={() => (gpsActive ? stopGps() : void startGps())}
                >
                  <LocateFixed size={17} />
                  {t(gpsActive ? "stopGps" : "gpsEnable")}
                </button>
              </div>
              <div className="about-block">
                <h3>{t("about")}</h3>
                <p>{t("aboutText")}</p>
                <p className="small muted">0.1.0 · 18.10.2026</p>
                <a
                  href="https://vtour.kubsu.ru/01/index.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("openTour")}
                  <ExternalLink size={15} />
                </a>
              </div>
            </section>
          )}
        </div>
        <nav className="desktop-nav" aria-label={t("navigator")}>
          {navigation}
        </nav>
      </aside>
      <main className={`map-area ${tab === "route" ? "has-route" : ""}`}>
        <div className="map-topbar">
          <div className="map-campus-title">
            <span className="campus-icon">
              <Building2 size={21} />
            </span>
            <span>
              <strong>{localize(campus.title, locale)}</strong>
              <small>{localize(campus.address, locale)}</small>
            </span>
            <span className="offline-pill">
              <span />
              {t("offline")}
            </span>
          </div>
          <div className="map-top-actions">
            <button
              aria-label={dark ? t("light") : t("dark")}
              className="icon-button"
              onClick={() =>
                setPreferences((p) => ({
                  ...p,
                  theme: dark ? "light" : "dark",
                }))
              }
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              className="locale-button"
              aria-label={t("language")}
              onClick={() =>
                setPreferences((p) => ({
                  ...p,
                  locale:
                    localeCodes[
                      (localeCodes.indexOf(p.locale) + 1) % localeCodes.length
                    ],
                }))
              }
            >
              {locale.toUpperCase()}
            </button>
          </div>
        </div>
        <div className="map-surface">
          {outdoor ? (
            <OutdoorMap
              ref={map}
              fix={fix}
              locale={locale}
              campus={campus}
              selected={selected}
              onSelect={(p) => {
                setSelected(p);
                setTab("map");
              }}
            />
          ) : mode === "3d" ? (
            <Suspense
              fallback={
                <div className="map-fallback" role="status">
                  {t("mapLoad")}
                </div>
              }
            >
              <Map3D
                ref={map}
                campus={campus}
                floor={floor}
                locale={locale}
                dark={dark}
                overview={overview}
                exploded={exploded}
                selected={selected}
                route={route}
                progressNode={currentStep?.nodeId}
                onSelect={selectPlace}
                onFallback={() => {
                  setMode("2d");
                  setOverview(false);
                }}
              />
            </Suspense>
          ) : (
            <Map2D
              ref={map}
              campus={campus}
              floor={floor}
              locale={locale}
              selected={selected}
              route={route}
              progressNode={currentStep?.nodeId}
              onSelect={selectPlace}
            />
          )}
          {hasOutdoor && (
            <div className="map-layer-switch">
              <button
                className={!outdoor ? "active" : ""}
                onClick={() => setOutdoor(false)}
              >
                <Layers3 size={16} />
                {t("indoor")}
              </button>
              <button
                className={outdoor ? "active" : ""}
                onClick={() => setOutdoor(true)}
              >
                <LocateFixed size={16} />
                {t("outdoors")}
              </button>
            </div>
          )}
          {!outdoor && (
            <div className="view-switch">
              <button
                className={mode === "2d" ? "active" : ""}
                onClick={() => {
                  setMode("2d");
                  setOverview(false);
                }}
              >
                2D
              </button>
              <button
                className={mode === "3d" ? "active" : ""}
                onClick={() => setMode("3d")}
              >
                3D
              </button>
            </div>
          )}
          {!outdoor && (
            <div
              className="floor-picker"
              role="group"
              aria-label={t("chooseFloor")}
            >
              <Layers3 size={18} />
              {[...campus.floors].reverse().map((f) => (
                <button
                  className={
                    floor === f && (mode === "2d" || !overview) ? "active" : ""
                  }
                  key={f}
                  onClick={() => {
                    setFloor(f);
                    setOverview(false);
                  }}
                  aria-label={`${f} ${t("floor")}`}
                  aria-pressed={floor === f && (mode === "2d" || !overview)}
                >
                  {f}
                </button>
              ))}
              {mode === "3d" && (
                <button
                  className={
                    overview ? "active overview-button" : "overview-button"
                  }
                  onClick={() => setOverview(true)}
                  aria-label={t("overview")}
                >
                  <Building2 size={18} />
                </button>
              )}
            </div>
          )}
          <div className="map-controls">
            <button
              className="icon-button"
              aria-label={t("resetMap")}
              onClick={() => map.current?.reset()}
            >
              <Compass size={22} />
            </button>
            <div className="zoom-group">
              <button
                className="icon-button"
                aria-label={t("zoomIn")}
                onClick={() => map.current?.zoom(1.3)}
              >
                <Plus size={21} />
              </button>
              <button
                className="icon-button"
                aria-label={t("zoomOut")}
                onClick={() => map.current?.zoom(1 / 1.3)}
              >
                <Minus size={21} />
              </button>
            </div>
            <button
              className={`icon-button ${gpsStatus === "ready" ? "gps-active" : ""}`}
              aria-label={t("locate")}
              onClick={() => {
                setLocationPanel(true);
                if (!gpsActive) void startGps();
                else if (fix && outdoor && isOnCampus(fix))
                  map.current?.focus(projectOutdoor(fix));
              }}
            >
              <LocateFixed size={22} />
            </button>
          </div>
          {mode === "3d" && !outdoor && overview && (
            <button
              className={`explode-control ${exploded ? "active" : ""}`}
              onClick={() => setExploded((v) => !v)}
              aria-pressed={exploded}
            >
              <Layers3 size={17} />
              {t("exploded")}
            </button>
          )}
          {locationPanel && (
            <div className="location-popover" role="status">
              <div>
                <LocateFixed size={19} />
                <strong>{t("location")}</strong>
                <button
                  className="icon-button"
                  aria-label={t("close")}
                  onClick={() => setLocationPanel(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <p>{gpsMessage()}</p>
              {fix && (
                <small>
                  {fix.latitude.toFixed(6)}, {fix.longitude.toFixed(6)} · ±
                  {Math.round(fix.accuracy)} {t("meter")}
                </small>
              )}
              <div className="location-actions">
                <button
                  className="link-button"
                  disabled={!hasOutdoor}
                  onClick={() => {
                    setOutdoor(true);
                    if (fix && isOnCampus(fix))
                      setTimeout(
                        () => map.current?.focus(projectOutdoor(fix)),
                        0,
                      );
                  }}
                >
                  {t("outdoors")}
                  <ArrowRight size={15} />
                </button>
                <button
                  className="link-button"
                  onClick={() => (gpsActive ? stopGps() : void startGps())}
                >
                  {t(gpsActive ? "stopGps" : "gpsEnable")}
                </button>
              </div>
            </div>
          )}
          <div className="map-footer">
            <span>
              <i className="legend-square" />
              {outdoor
                ? t("geoHint")
                : mode === "3d"
                  ? t("modelHint")
                  : t("planHint")}
            </span>
            {!outdoor && (
              <span className="archive-label">
                <Info size={13} />
                {t("sourceData")} {campus.source.version}
              </span>
            )}
          </div>
          {outdoor && route && (
            <div className="map-route-note">{t("geoRouteHint")}</div>
          )}
        </div>
        <div className="desktop-map-bottom">
          <div>
            <MapPin size={17} />
            <span>{localize(campus.address, locale)}</span>
          </div>
          <button
            onClick={() => {
              setTab("settings");
              setSelected(null);
            }}
          >
            {t("notVerified")}
            <ArrowUpRight size={14} />
          </button>
        </div>
      </main>
      <nav className="mobile-nav" aria-label={t("navigator")}>
        {navigation}
      </nav>
      {search && (
        <SearchDialog
          campus={campus}
          locale={locale}
          initialCategory={search.category}
          title={
            search.target === "from"
              ? t("chooseStart")
              : search.target === "to"
                ? t("chooseEnd")
                : t("searchAll")
          }
          onClose={() => setSearch(null)}
          onSelect={(p) => {
            if (search.target === "place") {
              selectPlace(p);
              setSearch(null);
            } else chooseRoutePoint(p, search.target);
          }}
        />
      )}
      {report && (
        <ReportDialog
          locale={locale}
          placeName={selected ? localize(selected.name, locale) : undefined}
          onClose={() => setReport(false)}
          onExport={async (issue) => {
            try {
              await exportText(
                "kubsu-map-issue.json",
                JSON.stringify(
                  {
                    campusId: campus.id,
                    dataVersion: campus.version,
                    placeId: selected?.id,
                    issue,
                    createdAt: new Date().toISOString(),
                  },
                  null,
                  2,
                ),
                "application/json",
              );
              setReport(false);
              if (!Capacitor.isNativePlatform()) notify(t("issueSaved"));
            } catch (error) {
              if ((error as Error).name !== "AbortError")
                notify(t("exportError"));
            }
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function locationHref() {
  return window.location.href;
}
function CampusIllustration() {
  return (
    <svg viewBox="0 0 320 108" fill="none" aria-hidden="true">
      <path d="M20 89 145 16 302 55 178 106Z" fill="#d7e7cf" />
      <path d="m49 70 56-32 26 7-55 32z" fill="#fbfcf4" />
      <path d="M49 70v12l27 7V77z" fill="#94b19d" />
      <path d="m76 77 55-32v12L76 89z" fill="#bdcfb8" />
      <path d="m136 56 49-29 71 18-49 29z" fill="#fcfdf7" />
      <path d="m136 56 71 18v20l-71-18z" fill="#a0bba5" />
      <path d="m207 74 49-29v20l-49 29z" fill="#c2d6b9" />
      <path d="m127 34 14-8 106 27-14 8z" fill="#fffef7" />
      <path d="m127 34 106 27v10L127 44z" fill="#90ac98" />
      <path d="m233 61 14-8v10l-14 8z" fill="#bfd0b7" />
      <path
        d="m94 96 43-25 56 14"
        stroke="#147d65"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="4 5"
      />
      <circle cx="94" cy="96" r="4" fill="#147d65" />
      <circle cx="193" cy="85" r="4" fill="#147d65" />
    </svg>
  );
}
