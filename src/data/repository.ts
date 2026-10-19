import source from "./campus.json";
import type { CampusPackage } from "../domain/types";

export function validateCampus(input: unknown): CampusPackage {
  if (!input || typeof input !== "object")
    throw Error("Invalid campus package");
  const c = input as CampusPackage;
  if (
    c.schemaVersion !== 1 ||
    typeof c.id !== "string" ||
    !c.id ||
    typeof c.version !== "string" ||
    !Array.isArray(c.nodes) ||
    !Array.isArray(c.edges) ||
    !Array.isArray(c.places) ||
    !Array.isArray(c.geometry) ||
    !Array.isArray(c.buildings) ||
    !Array.isArray(c.floors) ||
    !Array.isArray(c.contextShapes)
  )
    throw Error("Unsupported campus schema");
  if (
    !c.buildings.length ||
    c.nodes.length > 100000 ||
    c.edges.length > 300000 ||
    c.places.length > 50000
  )
    throw Error("Package exceeds offline limits");
  const localized = (v: unknown) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as { ru?: unknown }).ru === "string" &&
    typeof (v as { en?: unknown }).en === "string" &&
    Object.values(v).every((text) => typeof text === "string");
  const point = (v: unknown) =>
    !!v &&
    typeof v === "object" &&
    Number.isFinite((v as { x?: unknown }).x) &&
    Number.isFinite((v as { y?: unknown }).y);
  const path = (v: unknown) =>
    typeof v === "string" &&
    v.length < 500000 &&
    /^[MmZzLlHhVvCcSsQqTtAaEe\d\s.,+\-]+$/.test(v);
  if (
    !localized(c.title) ||
    !localized(c.address) ||
    !c.source ||
    !localized(c.source.name) ||
    typeof c.source.version !== "string" ||
    (c.source.uri !== null && typeof c.source.uri !== "string") ||
    (c.source.sha256 !== null && !/^[a-f0-9]{64}$/i.test(c.source.sha256)) ||
    !c.floors.length ||
    c.floors.some((f) => !Number.isInteger(f)) ||
    new Set(c.floors).size !== c.floors.length
  )
    throw Error("Invalid metadata");
  const buildings = new Set<string>();
  const evidence = new Set<string>();
  if (
    c.contextBounds &&
    (!point(c.contextBounds) ||
      !Number.isFinite(c.contextBounds.width) ||
      !Number.isFinite(c.contextBounds.height) ||
      c.contextBounds.width <= 0 ||
      c.contextBounds.height <= 0)
  )
    throw Error("Invalid context bounds");
  if (c.evidenceSources !== undefined) {
    if (!Array.isArray(c.evidenceSources) || c.evidenceSources.length > 1000)
      throw Error("Invalid evidence sources");
    for (const s of c.evidenceSources) {
      if (
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        evidence.has(s.id) ||
        !localized(s.title) ||
        !["user", "official", "yandex", "osm", "repository"].includes(s.kind) ||
        typeof s.consultedAt !== "string" ||
        (s.url !== null &&
          (typeof s.url !== "string" || !/^https:\/\/[^\s]+$/.test(s.url)))
      )
        throw Error("Invalid evidence source");
      evidence.add(s.id);
    }
  }
  const evidenceRefs = (v: unknown) =>
    v === undefined ||
    (Array.isArray(v) &&
      v.every((id) => typeof id === "string" && evidence.has(id)));
  for (const b of c.buildings) {
    if (
      typeof b.id !== "string" ||
      buildings.has(b.id) ||
      !localized(b.name) ||
      !localized(b.shortName) ||
      !point(b.center) ||
      !b.bounds ||
      b.bounds.width <= 0 ||
      b.bounds.height <= 0 ||
      ![b.bounds.x, b.bounds.y, b.bounds.width, b.bounds.height].every(
        Number.isFinite,
      ) ||
      !Array.isArray(b.floors) ||
      !b.floors.length ||
      b.floors.some((f) => !c.floors.includes(f))
    )
      throw Error("Invalid building");
    buildings.add(b.id);
  }
  for (const b of c.buildings) {
    const ancestors = new Set([b.id]);
    let parent = b.parentBuildingId;
    while (parent !== undefined) {
      if (
        typeof parent !== "string" ||
        !buildings.has(parent) ||
        ancestors.has(parent)
      )
        throw Error("Invalid building relationship");
      ancestors.add(parent);
      parent = c.buildings.find((v) => v.id === parent)?.parentBuildingId;
    }
  }
  const ids = new Set<string>();
  for (const n of c.nodes) {
    if (
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      !point(n) ||
      !c.floors.includes(n.floor) ||
      !["indoor", "outdoor"].includes(n.environment)
    )
      throw Error("Invalid node: " + n.id);
    ids.add(n.id);
  }
  const edges = new Set<string>();
  for (const e of c.edges) {
    if (
      typeof e.id !== "string" ||
      edges.has(e.id) ||
      !ids.has(e.from) ||
      !ids.has(e.to) ||
      !Number.isFinite(e.cost) ||
      e.cost < 0 ||
      !["walk", "stairs", "lift"].includes(e.kind) ||
      !["yes", "no", "unknown"].includes(e.accessible) ||
      typeof e.closed !== "boolean" ||
      typeof e.bidirectional !== "boolean" ||
      (e.instruction !== undefined && !localized(e.instruction)) ||
      !evidenceRefs(e.evidenceIds)
    )
      throw Error("Invalid edge: " + e.id);
    edges.add(e.id);
  }
  const places = new Set<string>();
  const categories = [
    "room",
    "entrance",
    "food",
    "library",
    "museum",
    "sport",
    "toilet",
    "stairs",
    "office",
    "building",
    "landmark",
    "dormitory",
  ];
  for (const p of c.places) {
    if (
      typeof p.id !== "string" ||
      places.has(p.id) ||
      !Array.isArray(p.nodeIds) ||
      p.nodeIds.some((id) => !ids.has(id)) ||
      !localized(p.name) ||
      !localized(p.description) ||
      !Array.isArray(p.aliases) ||
      p.aliases.some((a) => typeof a !== "string") ||
      typeof p.originalName !== "string" ||
      (p.searchable !== undefined && typeof p.searchable !== "boolean") ||
      typeof p.source !== "string" ||
      typeof p.verified !== "boolean" ||
      (p.mapVisible !== undefined && typeof p.mapVisible !== "boolean") ||
      (p.mapLabel !== undefined && !localized(p.mapLabel)) ||
      (p.catalogStatus !== undefined &&
        !["unresolved", "curated"].includes(p.catalogStatus)) ||
      (p.environment !== undefined &&
        !["indoor", "outdoor"].includes(p.environment)) ||
      !evidenceRefs(p.evidenceIds) ||
      (p.outdoorFeatureIds !== undefined &&
        (!Array.isArray(p.outdoorFeatureIds) ||
          p.outdoorFeatureIds.some(
            (id) => typeof id !== "string" || !/^(way|node)\/\d+$/.test(id),
          ))) ||
      !categories.includes(p.category) ||
      (p.environment === "outdoor"
        ? p.buildingId !== null || p.floor !== null
        : p.buildingId === null ||
          p.floor === null ||
          !buildings.has(p.buildingId) ||
          !c.floors.includes(p.floor)) ||
      ![p.x, p.y, p.width, p.height].every(Number.isFinite) ||
      p.width < 0 ||
      p.height < 0
    )
      throw Error("Invalid place: " + p.id);
    places.add(p.id);
  }
  for (const p of c.places)
    if (
      p.duplicateOf !== undefined &&
      (!places.has(p.duplicateOf) || p.duplicateOf === p.id)
    )
      throw Error("Invalid duplicate reference");
  for (const b of c.buildings)
    if (!Array.isArray(b.nodeIds) || b.nodeIds.some((id) => !ids.has(id)))
      throw Error("Invalid building entrance");
  for (const g of c.geometry)
    if (
      !buildings.has(g.buildingId) ||
      !c.floors.includes(g.floor) ||
      !Array.isArray(g.footprint) ||
      !Array.isArray(g.walls) ||
      ![...g.footprint, ...g.walls].every(path)
    )
      throw Error("Invalid floor geometry");
  if (
    c.contextShapes.some(
      (s) =>
        !path(s.path) ||
        !Number.isFinite(s.levels) ||
        s.levels < 0 ||
        s.levels > 200 ||
        (s.kind !== undefined &&
          !["building", "track", "field", "marking", "outline"].includes(
            s.kind,
          )) ||
        (s.placeId !== undefined && !places.has(s.placeId)) ||
        (s.transform !== undefined &&
          (!Array.isArray(s.transform) ||
            s.transform.length !== 6 ||
            !s.transform.every(Number.isFinite))),
    )
  )
    throw Error("Invalid context geometry");
  if (
    !c.coordinates ||
    c.coordinates.system !== "local" ||
    (c.coordinates.metersPerUnit !== null &&
      (!(c.coordinates.metersPerUnit > 0) ||
        !Number.isFinite(c.coordinates.metersPerUnit)))
  )
    throw Error("Invalid scale");
  if (c.coordinates.geoReference) {
    const g = c.coordinates.geoReference;
    if (
      !["draft", "surveyed"].includes(g.status) ||
      !Array.isArray(g.transform) ||
      g.transform.length !== 6 ||
      !g.transform.every(Number.isFinite) ||
      !Array.isArray(g.boundary) ||
      g.boundary.length < 3 ||
      !g.boundary.every(point) ||
      !Number.isFinite(g.metersPerUnit) ||
      g.metersPerUnit <= 0 ||
      !Number.isFinite(g.maxResidualMeters) ||
      g.maxResidualMeters < 0
    )
      throw Error("Invalid georeference");
  }
  return c;
}
export const defaultCampus = validateCampus(source);
