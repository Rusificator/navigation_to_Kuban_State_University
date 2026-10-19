import type { CampusPackage, Point, Route, RouteStep } from "./types";

/** All renderers use data bounds, never a fixed coordinate origin. */
export function campusBounds(campus: CampusPackage) {
  const boxes = [
    ...campus.buildings.map((b) => b.bounds),
    ...campus.places.filter((p) => p.environment === "outdoor"),
    ...(campus.contextBounds ? [campus.contextBounds] : []),
  ];
  const x = Math.min(...boxes.map((b) => b.x)) - 15;
  const y = Math.min(...boxes.map((b) => b.y)) - 15;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + 15;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + 15;
  return { x, y, w: right - x, h: bottom - y };
}

export function transitionPoint(
  route: Route,
  step: RouteStep,
  floor: number,
  nodes: Map<string, Point>,
): Point | undefined {
  const id =
    floor === step.floor ? step.nodeId : route.nodeIds[step.pathIndex + 1];
  return nodes.get(id);
}
