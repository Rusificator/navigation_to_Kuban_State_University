import { forwardRef, useEffect, useImperativeHandle } from "react";
import type {
  CampusPackage,
  Locale,
  Place,
  Point,
  Route,
} from "../domain/types";
import type { MapHandle } from "./map-types";
import { useMapViewport } from "./useMapViewport";
import { campusBounds, transitionPoint } from "../domain/mapGeometry";
import { localize } from "../domain/localization";
import { translate } from "../i18n";

interface Props {
  campus: CampusPackage;
  floor: number;
  locale: Locale;
  selected: Place | null;
  route: Route | null;
  progressNode?: string;
  location?: Point;
  onSelect: (place: Place) => void;
}
export const Map2D = forwardRef<MapHandle, Props>(function Map2D(
  { campus, floor, locale, selected, route, progressNode, location, onSelect },
  ref,
) {
  const t = translate(locale);
  const { svg, view, setView, handle, bindings } = useMapViewport(
    campusBounds(campus),
    (point) => {
      const target = document
        .elementFromPoint(point.x, point.y)
        ?.closest("[data-place]") as SVGElement | null;
      const place = campus.places.find((p) => p.id === target?.dataset.place);
      if (place) onSelect(place);
    },
  );
  const nodes = new Map(campus.nodes.map((n) => [n.id, n]));
  useImperativeHandle(ref, () => handle);
  useEffect(() => {
    if (selected)
      setView((v) => {
        const w =
          selected.environment === "outdoor"
            ? Math.max(
                120,
                selected.width * 1.4,
                selected.height * (v.w / v.h) * 1.4,
              )
            : selected.category === "building"
              ? 220
              : 120;
        return {
          x: selected.x + selected.width / 2 - w / 2,
          y: selected.y + selected.height / 2 - (w * v.h) / v.w / 2,
          w,
          h: (w * v.h) / v.w,
        };
      });
  }, [selected?.id]);
  const pathParts: Point[][] = [];
  if (route) {
    let part: Point[] = [];
    for (const id of route.nodeIds) {
      const n = nodes.get(id)!;
      if (n.floor === floor) {
        part.push(n);
      } else if (part.length) {
        pathParts.push(part);
        part = [];
      }
    }
    if (part.length) pathParts.push(part);
  }
  const first = route ? nodes.get(route.nodeIds[0]) : undefined,
    last = route ? nodes.get(route.nodeIds.at(-1)!) : undefined;
  const current = progressNode ? nodes.get(progressNode) : undefined;
  const marker = (p: Point, label: string, className: string) => (
    <g transform={`translate(${p.x} ${p.y})`} className={className}>
      <circle r="4.5" />
      <text y="1.3" textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <svg
      ref={svg}
      className="map-svg"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label={`${t("planAria")} ${floor}`}
      {...bindings}
    >
      <defs>
        <pattern
          id="dots"
          x="0"
          y="0"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".25" className="map-dot" />
        </pattern>
      </defs>
      <rect x="-600" y="-600" width="1800" height="1800" fill="url(#dots)" />
      <g className="context-buildings">
        {campus.contextShapes.map((s, i) => (
          <path
            key={i}
            d={s.path}
            transform={
              s.transform ? `matrix(${s.transform.join(" ")})` : undefined
            }
            data-place={s.placeId}
            className={`context-${s.kind ?? "building"} ${selected && s.placeId === selected.id ? "selected" : ""}`}
          />
        ))}
      </g>
      <g className="outdoor-paths">
        {campus.edges
          .filter(
            (e) =>
              nodes.get(e.from)?.environment === "outdoor" &&
              nodes.get(e.to)?.environment === "outdoor",
          )
          .map((e) => (
            <line
              key={e.id}
              x1={nodes.get(e.from)!.x}
              y1={nodes.get(e.from)!.y}
              x2={nodes.get(e.to)!.x}
              y2={nodes.get(e.to)!.y}
            />
          ))}
      </g>
      {campus.geometry
        .filter((g) => g.floor === floor)
        .map((g) => (
          <g key={g.buildingId}>
            <g className="floor-fill">
              {g.footprint.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <g className="map-rooms">
              {campus.places
                .filter(
                  (p) =>
                    p.buildingId === g.buildingId &&
                    p.floor === floor &&
                    p.mapVisible !== false &&
                    p.width > 0,
                )
                .map((p) => (
                  <rect
                    data-place={p.id}
                    className={`room-shape cat-${p.category} ${selected?.id === p.id ? "selected" : ""}`}
                    key={p.id}
                    x={p.x}
                    y={p.y}
                    width={p.width}
                    height={p.height}
                  >
                    <title>{localize(p.name, locale)}</title>
                  </rect>
                ))}
            </g>
            <g className="floor-walls">
              {g.walls.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          </g>
        ))}
      <g className="building-labels">
        {campus.buildings
          .filter((b) => b.floors.includes(floor))
          .map((b) => (
            <text key={b.id} x={b.center.x} y={b.bounds.y - 5}>
              {localize(b.shortName, locale)}
            </text>
          ))}
      </g>
      <g className="campus-place-labels">
        {campus.places
          .filter((p) => p.environment === "outdoor")
          .map((p) => {
            const label = localize(p.mapLabel ?? p.name, locale);
            const width = label.length * 2.65 + 9;
            return (
              <g
                key={p.id}
                data-place={p.id}
                role="button"
                tabIndex={0}
                aria-label={localize(p.name, locale)}
                className={selected?.id === p.id ? "selected" : ""}
                transform={`translate(${p.x + p.width / 2} ${p.y + p.height / 2})`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(p);
                  }
                }}
              >
                <rect x={-width / 2} y={-5} width={width} height={10} rx={4} />
                <text textAnchor="middle" y={1.6}>
                  {label}
                </text>
              </g>
            );
          })}
      </g>
      {view.w < 260 && (
        <g className="room-labels">
          {campus.places
            .filter(
              (p) =>
                p.floor === floor &&
                p.mapVisible !== false &&
                p.catalogStatus !== "unresolved" &&
                p.width > 3 &&
                p.originalName &&
                p.originalName !== "..." &&
                p.category !== "building",
            )
            .map((p) => (
              <text
                key={p.id}
                x={p.x + p.width / 2}
                y={p.y + p.height / 2 + 0.6}
                fontSize={p.originalName.length > 8 ? 1.8 : 2.25}
              >
                {p.originalName.length > 18
                  ? p.originalName.slice(0, 16) + "…"
                  : p.originalName}
              </text>
            ))}
        </g>
      )}
      <g className="route-halo">
        {pathParts.map((p, i) => (
          <polyline key={i} points={p.map((n) => `${n.x},${n.y}`).join(" ")} />
        ))}
      </g>
      <g className="route-line">
        {pathParts.map((p, i) => (
          <polyline key={i} points={p.map((n) => `${n.x},${n.y}`).join(" ")} />
        ))}
      </g>
      {route?.steps
        .filter(
          (s) =>
            s.toFloor !== undefined &&
            (s.floor === floor || s.toFloor === floor),
        )
        .map((s) => {
          const p = transitionPoint(route!, s, floor, nodes);
          if (!p) return null;
          return (
            <g
              key={s.id}
              className="transition-marker"
              transform={`translate(${p.x} ${p.y})`}
            >
              <rect x="-6" y="-3" width="12" height="6" rx="2" />
              <text textAnchor="middle" y="1">
                {s.floor}→{s.toFloor}
              </text>
            </g>
          );
        })}
      {first?.floor === floor && marker(first, "A", "route-start")}
      {last?.floor === floor && marker(last, "B", "route-end")}
      {current?.floor === floor && (
        <g className="position-marker">
          <circle cx={current.x} cy={current.y} r="4" />
          <circle cx={current.x} cy={current.y} r="1.8" />
        </g>
      )}
      {location && (
        <g className="position-marker">
          <circle cx={location.x} cy={location.y} r="5" />
          <circle cx={location.x} cy={location.y} r="2" />
        </g>
      )}
    </svg>
  );
});
