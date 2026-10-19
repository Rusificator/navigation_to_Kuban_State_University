import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Point } from "../domain/types";

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shared SVG gestures. The scale includes SVG's letterbox on narrow screens. */
export function useMapViewport(base: Viewport, onTap?: (point: Point) => void) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(base);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const current = useRef(view);
  current.current = view;
  const pointers = useRef(new Map<number, Point>());
  const moved = useRef(false);
  const origin = useRef<Point>({ x: 0, y: 0 });
  const scale = (v = current.current) =>
    Math.max(
      v.w / (svg.current?.clientWidth || 1),
      v.h / (svg.current?.clientHeight || 1),
    );
  const mapPoint = (p: Point, v = current.current): Point => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const units = scale(v);
    return {
      x: v.x + v.w / 2 + (p.x - rect.left - rect.width / 2) * units,
      y: v.y + v.h / 2 + (p.y - rect.top - rect.height / 2) * units,
    };
  };
  const zoom = (factor: number, at?: Point) =>
    setView((v) => {
      if (!Number.isFinite(factor) || factor <= 0) return v;
      const w = Math.max(base.w / 30, Math.min(base.w * 3, v.w / factor));
      const ratio = w / v.w;
      const p = at ? mapPoint(at, v) : { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      return {
        x: p.x + (v.x - p.x) * ratio,
        y: p.y + (v.y - p.y) * ratio,
        w,
        h: v.h * ratio,
      };
    });
  useEffect(() => setView(base), [base.x, base.y, base.w, base.h]);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({
        width: element.clientWidth || 1,
        height: element.clientHeight || 1,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = svg.current;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX, y: e.clientY });
    };
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => element?.removeEventListener("wheel", wheel);
  }, [base.w]);
  const handle = {
    zoom: (factor: number) => zoom(factor),
    reset: () => setView(base),
    focus: (p: Point) =>
      setView((v) => ({ ...v, x: p.x - v.w / 2, y: p.y - v.h / 2 })),
  };
  const bindings = {
    tabIndex: 0,
    onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoom(1.3);
      }
      if (e.key === "-") {
        e.preventDefault();
        zoom(1 / 1.3);
      }
      if (e.key === "Home") {
        e.preventDefault();
        handle.reset();
      }
      const directions: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const d = directions[e.key];
      if (d) {
        e.preventDefault();
        setView((v) => ({
          ...v,
          x: v.x + d.x * v.w * 0.12,
          y: v.y + d.y * v.h * 0.12,
        }));
      }
    },
    onPointerDown(e: PointerEvent<SVGSVGElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        moved.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
      } else moved.current = true;
    },
    onPointerMove(e: PointerEvent<SVGSVGElement>) {
      const old = pointers.current.get(e.pointerId);
      if (!old) return;
      const before = [...pointers.current.values()];
      const point = { x: e.clientX, y: e.clientY };
      pointers.current.set(e.pointerId, point);
      if (
        Math.hypot(point.x - origin.current.x, point.y - origin.current.y) > 5
      )
        moved.current = true;
      if (pointers.current.size === 1) {
        const units = scale();
        setView((v) => ({
          ...v,
          x: v.x - (point.x - old.x) * units,
          y: v.y - (point.y - old.y) * units,
        }));
      } else if (pointers.current.size === 2) {
        const [a, b] = before,
          [c, d] = [...pointers.current.values()];
        const previousDistance = Math.hypot(a.x - b.x, a.y - b.y),
          distance = Math.hypot(c.x - d.x, c.y - d.y);
        if (previousDistance > 1 && distance > 1)
          zoom(distance / previousDistance, {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
          });
        const units = scale();
        setView((v) => ({
          ...v,
          x: v.x - ((c.x + d.x - (a.x + b.x)) / 2) * units,
          y: v.y - ((c.y + d.y - (a.y + b.y)) / 2) * units,
        }));
      }
    },
    onPointerUp(e: PointerEvent<SVGSVGElement>) {
      pointers.current.delete(e.pointerId);
      if (!moved.current && !pointers.current.size)
        onTap?.({ x: e.clientX, y: e.clientY });
    },
    onPointerCancel() {
      pointers.current.clear();
      moved.current = true;
    },
  };
  return {
    svg,
    view,
    setView,
    handle,
    bindings,
    unitsPerPixel: Math.max(view.w / size.width, view.h / size.height),
  };
}
