/** All routing coordinates are in the campus package's local coordinate system. */
export type { Locale } from "./localization";
export type Localized = { ru: string; en: string; [locale: string]: string };
export type Category =
  | "room"
  | "entrance"
  | "food"
  | "library"
  | "museum"
  | "sport"
  | "toilet"
  | "stairs"
  | "office"
  | "building"
  | "dormitory"
  | "landmark";
export type Point = { x: number; y: number };
export interface Place {
  id: string;
  name: Localized;
  originalName: string;
  description: Localized;
  category: Category;
  buildingId: string | null;
  floor: number | null;
  environment?: "indoor" | "outdoor";
  mapLabel?: Localized;
  mapVisible?: boolean;
  catalogStatus?: "unresolved" | "curated";
  duplicateOf?: string;
  evidenceIds?: string[];
  outdoorFeatureIds?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
  aliases: string[];
  source: string;
  verified: boolean;
  searchable?: boolean;
}
export interface NavNode extends Point {
  id: string;
  floor: number;
  environment: "indoor" | "outdoor";
  buildingId?: string;
}
export interface NavEdge {
  id: string;
  from: string;
  to: string;
  cost: number;
  kind: "walk" | "stairs" | "lift";
  accessible: "yes" | "no" | "unknown";
  bidirectional: boolean;
  closed: boolean;
  instruction?: Localized;
  evidenceIds?: string[];
}
export interface FloorGeometry {
  floor: number;
  buildingId: string;
  footprint: string[];
  walls: string[];
}
export interface Building {
  id: string;
  name: Localized;
  shortName: Localized;
  center: Point;
  bounds: { x: number; y: number; width: number; height: number };
  floors: number[];
  nodeIds: string[];
  parentBuildingId?: string;
}
export interface EvidenceSource {
  id: string;
  title: Localized;
  kind: "user" | "official" | "yandex" | "osm" | "repository";
  url: string | null;
  consultedAt: string;
}
export interface ContextShape {
  path: string;
  levels: number;
  kind?: "building" | "track" | "field" | "marking" | "outline";
  placeId?: string;
  transform?: [number, number, number, number, number, number];
}
export interface GeoReference {
  /** Affine conversion [longitude,latitude,1] -> local [x,y]. */
  transform: [number, number, number, number, number, number];
  status: "draft" | "surveyed";
  maxResidualMeters: number;
  surveyedAt: string;
  metersPerUnit: number;
  boundary: Point[];
}
export interface CampusPackage {
  schemaVersion: 1;
  id: string;
  version: string;
  title: Localized;
  address: Localized;
  source: {
    name: Localized;
    version: string;
    uri: string | null;
    sha256: string | null;
    importedAt: string;
    verifiedAt: string | null;
  };
  coordinates: {
    system: "local";
    metersPerUnit: number | null;
    geoReference: GeoReference | null;
  };
  floors: number[];
  buildings: Building[];
  places: Place[];
  nodes: NavNode[];
  edges: NavEdge[];
  geometry: FloorGeometry[];
  contextShapes: ContextShape[];
  contextBounds?: { x: number; y: number; width: number; height: number };
  evidenceSources?: EvidenceSource[];
}
export type RouteProfile = "walking" | "stepFree";
export interface Route {
  nodeIds: string[];
  edgeIds: string[];
  cost: number;
  floors: number[];
  steps: RouteStep[];
  distanceMeters: number | null;
}
export interface RouteStep {
  id: string;
  kind:
    | "start"
    | "straight"
    | "left"
    | "right"
    | "stairsUp"
    | "stairsDown"
    | "lift"
    | "passage"
    | "arrive";
  floor: number;
  toFloor?: number;
  nodeId: string;
  pathIndex: number;
  instruction?: Localized;
}
export type RouteResult =
  | { ok: true; route: Route }
  | {
      ok: false;
      reason: "invalid-point" | "no-route" | "accessibility-unverified";
    };
