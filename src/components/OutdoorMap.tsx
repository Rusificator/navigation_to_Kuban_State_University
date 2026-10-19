import { forwardRef, useEffect, useImperativeHandle } from "react";
import data from "../data/outdoors.json";
import type { Fix } from "../domain/location";
import { insidePolygon } from "../domain/location";
import type { MapHandle } from "./map-types";
import { useMapViewport } from "./useMapViewport";
import type { CampusPackage, Locale, Place } from "../domain/types";
import { localize } from "../domain/localization";
import { translate } from "../i18n";
export function projectOutdoor(fix: Fix) {
  return {
    x:
      (fix.longitude - data.origin.longitude) *
      111320 *
      Math.cos((data.origin.latitude * Math.PI) / 180),
    y: (data.origin.latitude - fix.latitude) * 111320,
  };
}
export function isOnCampus(fix: Fix) {
  const p = projectOutdoor(fix);
  return data.boundary.some((poly) => insidePolygon(p, poly));
}
export const OutdoorMap = forwardRef<
  MapHandle,
  {
    fix: Fix | null;
    locale: Locale;
    campus: CampusPackage;
    selected: Place | null;
    onSelect: (place: Place) => void;
  }
>(function OutdoorMap({ fix, locale, campus, selected, onSelect }, ref) {
  const t = translate(locale);
  const base = {
    x: data.bounds.x,
    y: data.bounds.y,
    w: data.bounds.width,
    h: data.bounds.height,
  };
  const {
    svg,
    view: v,
    handle,
    bindings,
    unitsPerPixel,
    setView,
  } = useMapViewport(base, (point) => {
    const target = document
      .elementFromPoint(point.x, point.y)
      ?.closest("[data-place]") as SVGElement | null;
    const place = campus.places.find((p) => p.id === target?.dataset.place);
    if (place) onSelect(place);
  });
  useImperativeHandle(ref, () => handle);
  const byFeature = new Map(
    campus.places.flatMap((p) =>
      (p.outdoorFeatureIds ?? []).map((id) => [id, p] as const),
    ),
  );
  const labels = campus.places.flatMap((place) => {
    const ids = place.outdoorFeatureIds ?? [];
    const points = [
      ...data.features
        .filter((f) => ids.includes(f.id))
        .flatMap((f) => f.points),
      ...data.pois.filter((p) => ids.includes(p.id)),
    ];
    if (!points.length) return [];
    const x =
      (Math.min(...points.map((p) => p.x)) +
        Math.max(...points.map((p) => p.x))) /
      2;
    const y =
      (Math.min(...points.map((p) => p.y)) +
        Math.max(...points.map((p) => p.y))) /
      2;
    return [
      {
        place,
        x,
        y,
        width:
          Math.max(...points.map((p) => p.x)) -
          Math.min(...points.map((p) => p.x)),
        height:
          Math.max(...points.map((p) => p.y)) -
          Math.min(...points.map((p) => p.y)),
      },
    ];
  });
  useEffect(() => {
    const label = labels.find((l) => l.place.id === selected?.id);
    if (label)
      setView((v) => {
        const w = Math.max(
          150,
          label.width * 1.8,
          ((label.height * v.w) / v.h) * 1.8,
        );
        return {
          x: label.x - w / 2,
          y: label.y - (w * v.h) / v.w / 2,
          w,
          h: (w * v.h) / v.w,
        };
      });
  }, [selected?.id]);
  const scaleMeters = unitsPerPixel > 1.5 ? 100 : unitsPerPixel > 0.4 ? 50 : 10;
  const position = fix ? projectOutdoor(fix) : null;
  const usable =
    fix &&
    Date.now() - fix.timestamp < 15000 &&
    fix.timestamp <= Date.now() + 5000 &&
    fix.accuracy >= 0 &&
    fix.accuracy <= 100 &&
    isOnCampus(fix);
  const polygon = (points: { x: number; y: number }[]) =>
    points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <div className="outdoor-map">
      <svg
        ref={svg}
        className="map-svg outdoor-svg"
        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
        role="img"
        aria-label={t("outdoorAria")}
        {...bindings}
      >
        <defs>
          <clipPath id="campus-clip">
            {data.boundary.map((p, i) => (
              <polygon key={i} points={polygon(p)} />
            ))}
          </clipPath>
        </defs>
        {data.boundary.map((p, i) => (
          <polygon key={i} className="campus-boundary" points={polygon(p)} />
        ))}
        <g clipPath="url(#campus-clip)">
          {(["green", "sport", "path", "building"] as const).map((kind) => (
            <g key={kind} className={`osm-${kind}`}>
              {data.features
                .filter((f) => f.kind === kind)
                .map((f) =>
                  f.closed ? (
                    <polygon
                      key={f.id}
                      points={polygon(f.points)}
                      data-place={byFeature.get(f.id)?.id}
                      className={
                        selected && byFeature.get(f.id)?.id === selected.id
                          ? "selected"
                          : ""
                      }
                    />
                  ) : (
                    <polyline key={f.id} points={polygon(f.points)} />
                  ),
                )}
            </g>
          ))}
        </g>
        {data.features
          .filter(
            (f) => f.name && f.kind === "building" && !byFeature.has(f.id),
          )
          .map((f) => {
            const p = f.points.reduce(
              (a, b) => ({
                x: a.x + b.x / f.points.length,
                y: a.y + b.y / f.points.length,
              }),
              { x: 0, y: 0 },
            );
            return (
              <text className="osm-label" key={f.id} x={p.x} y={p.y}>
                {f.name.includes("Бассейн")
                  ? t("pool")
                  : f.name.includes("Главный")
                    ? t("mainBuilding")
                    : f.name}
              </text>
            );
          })}
        {labels.map(({ place, x, y }) => (
          <g
            key={place.id}
            data-place={place.id}
            role="button"
            tabIndex={0}
            aria-label={localize(place.name, locale)}
            className={`osm-place-label ${selected?.id === place.id ? "selected" : ""}`}
            transform={`translate(${x} ${y})`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(place);
              }
            }}
          >
            <circle r="3.4" />
            <text y="-7" textAnchor="middle">
              {localize(place.mapLabel ?? place.name, locale)}
            </text>
          </g>
        ))}
        {data.pois
          .filter((p) => !byFeature.has(p.id) && p.name)
          .map((p) => (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r="3" className="outdoor-poi" />
              <text className="osm-poi-label" x={p.x + 6} y={p.y + 2}>
                {t(p.kind === "library" ? "library" : "memorial")}
              </text>
            </g>
          ))}
        {usable && position && (
          <g className="gps-dot">
            <circle
              className="gps-accuracy"
              cx={position.x}
              cy={position.y}
              r={fix!.accuracy}
            />
            <circle cx={position.x} cy={position.y} r="4.5" />
            <circle cx={position.x} cy={position.y} r="1.5" />
          </g>
        )}
      </svg>
      <div className="outdoor-compass">
        N<span>↑</span>
      </div>
      <div className="osm-attribution">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors · ODbL
        </a>
      </div>
      <div className="map-scale">
        <i
          style={{
            width: scaleMeters / unitsPerPixel,
          }}
        />
        {scaleMeters} {t("meter")}
      </div>
    </div>
  );
});
