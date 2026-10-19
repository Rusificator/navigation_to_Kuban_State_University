import { describe, it, expect } from "vitest";
import { defaultCampus, validateCampus } from "../src/data/repository";
import { Router, makeSteps } from "../src/domain/router";
import { searchPlaces } from "../src/domain/search";
import { projectFix } from "../src/domain/location";
import { messages, stepLabel } from "../src/i18n";
import { localeCodes, localize } from "../src/domain/localization";
import { campusBounds, transitionPoint } from "../src/domain/mapGeometry";
import type {
  CampusPackage,
  GeoReference,
  NavEdge,
  NavNode,
} from "../src/domain/types";
const router = new Router(defaultCampus);
const room = (name: string) =>
  defaultCampus.places.find((p) => p.originalName === name)!;
const start = room("Главный вход");
describe("Legacy data preservation", () => {
  it("keeps every original room and graph entry", () => {
    expect(
      defaultCampus.places.filter((p) => p.id.startsWith("rect")),
    ).toHaveLength(969);
    expect(
      defaultCampus.nodes.filter((n) => !n.id.startsWith("curated-")),
    ).toHaveLength(2476);
    expect(
      defaultCampus.edges.filter((e) => !e.id.startsWith("curated-")),
    ).toHaveLength(2787);
  });
  it("restores runtime-added entrance names", () => {
    expect(searchPlaces(defaultCampus.places, "Вход в корпус Н")[0].id).toBe(
      "rect11031",
    );
  });
  it("does not collapse duplicate place names", () => {
    const matches = searchPlaces(defaultCampus.places, "Буфет");
    expect(matches.length).toBeGreaterThan(1);
    expect(new Set(matches.map((p) => p.id)).size).toBe(matches.length);
  });
  it("accepts Cyrillic, Latin and visual keyboard variants", () => {
    for (const query of ["А421", "A421", "ауд. А421", "аудитория А421"])
      expect(searchPlaces(defaultCampus.places, query)[0].id).toBe("rect10886");
  });
  it("offers explicit filters", () => {
    expect(
      searchPlaces(defaultCampus.places, "", {
        category: "food",
        floor: 1,
      }).every((p) => p.category === "food" && p.floor === 1),
    ).toBe(true);
  });
});
describe("Real campus routing", () => {
  it("connects the main entrance to A421 through real floor transitions", () => {
    const result = router.find(start.nodeIds, room("А421").nodeIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.floors[0]).toBe(1);
    expect(result.route.floors.at(-1)).toBe(4);
    expect(result.route.steps.some((s) => s.toFloor === 4)).toBe(true);
    expect(result.route.distanceMeters).toBeNull();
  });
  it("rejects isolated nodes but uses an alternative recorded entrance to N401", () => {
    expect(router.find(start.nodeIds, ["node2133"])).toEqual({
      ok: false,
      reason: "no-route",
    });
    expect(router.find(start.nodeIds, room("Н401").nodeIds).ok).toBe(true);
  });
  it("reports missing door data without a straight-line fallback", () => {
    expect(router.find(start.nodeIds, [])).toEqual({
      ok: false,
      reason: "invalid-point",
    });
  });
  it("never claims an accessible route on unknown accessibility", () => {
    expect(
      router.find(start.nodeIds, room("А421").nodeIds, "stepFree"),
    ).toEqual({ ok: false, reason: "accessibility-unverified" });
  });
  it("supports a route to the same place", () => {
    const r = router.find(start.nodeIds, start.nodeIds);
    expect(r.ok && r.route.cost).toBe(0);
  });
  it("produces connected paths and exact graph costs for a broad real-data sample", () => {
    const targets = defaultCampus.places
      .filter((p) => p.nodeIds.length)
      .filter((_, i) => i % 7 === 0);
    for (const target of targets) {
      const r = router.find(start.nodeIds, target.nodeIds);
      expect(r.ok, target.originalName).toBe(true);
      if (!r.ok) continue;
      expect(start.nodeIds).toContain(r.route.nodeIds[0]);
      expect(target.nodeIds).toContain(r.route.nodeIds.at(-1));
      expect(
        r.route.edgeIds.reduce(
          (sum, id) => sum + router.edges.get(id)!.cost,
          0,
        ),
      ).toBeCloseTo(r.route.cost, 6);
      r.route.edgeIds.forEach((id, i) => {
        const e = router.edges.get(id)!;
        expect([e.from, e.to]).toContain(r.route.nodeIds[i]);
        expect([e.from, e.to]).toContain(r.route.nodeIds[i + 1]);
      });
    }
  });
});
const node = (id: string, floor = 1): NavNode => ({
  id,
  x: 0,
  y: 0,
  floor,
  environment: "indoor",
});
const edge = (
  id: string,
  from: string,
  to: string,
  cost: number,
  extras: Partial<NavEdge> = {},
): NavEdge => ({
  id,
  from,
  to,
  cost,
  kind: "walk",
  accessible: "yes",
  closed: false,
  bidirectional: true,
  ...extras,
});
const graph = (nodes: NavNode[], edges: NavEdge[]) =>
  new Router({ ...defaultCampus, nodes, edges } as CampusPackage);
describe("Routing rules", () => {
  it("selects the optimal pair of entrances rather than the first pair", () => {
    const r = graph(
      ["a", "b", "c", "d"].map((id) => node(id)),
      [
        edge("ac", "a", "c", 90),
        edge("bd", "b", "d", 2),
        edge("cd", "c", "d", 1),
      ],
    ).find(["a", "b"], ["c", "d"]);
    expect(r.ok && r.route.nodeIds).toEqual(["b", "d"]);
  });
  it("honours closures and directional edges", () => {
    const r = graph(
      ["a", "b", "c"].map((id) => node(id)),
      [
        edge("ab", "a", "b", 1, { bidirectional: false }),
        edge("bc", "b", "c", 1, { closed: true }),
      ],
    );
    expect(r.find(["b"], ["a"]).ok).toBe(false);
    expect(r.find(["a"], ["c"]).ok).toBe(false);
  });
  it("chooses a confirmed lift instead of stairs for step-free routing", () => {
    const r = graph(
      [node("a"), node("b", 2), node("lift")],
      [
        edge("stairs", "a", "b", 1, { kind: "stairs", accessible: "no" }),
        edge("walk", "a", "lift", 2),
        edge("lift", "lift", "b", 4, { kind: "lift" }),
      ],
    ).find(["a"], ["b"], "stepFree");
    expect(r.ok && r.route.edgeIds).toEqual(["walk", "lift"]);
  });
  it("uses screen coordinate handedness for turn instructions", () => {
    const p = [
      { ...node("a"), x: 0, y: 0 },
      { ...node("b"), x: 10, y: 0 },
      { ...node("c"), x: 10, y: 10 },
    ];
    expect(makeSteps(p, []).map((s) => s.kind)).toContain("right");
  });
});
describe("GPS quality gates", () => {
  const geo: GeoReference = {
    status: "surveyed",
    transform: [1, 0, 0, 0, 1, 0],
    maxResidualMeters: 1,
    metersPerUnit: 1,
    surveyedAt: "2026-10-17",
    boundary: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  };
  const now = 100000,
    fix = { latitude: 5, longitude: 5, accuracy: 3, timestamp: now };
  it("requires a surveyed coordinate transform", () =>
    expect(projectFix(fix, null, now).status).toBe("uncalibrated"));
  it("rejects a draft transform", () =>
    expect(projectFix(fix, { ...geo, status: "draft" }, now).status).toBe(
      "uncalibrated",
    ));
  it("rejects stale, imprecise and out-of-campus positions", () => {
    expect(projectFix({ ...fix, timestamp: 1 }, geo, now).status).toBe("stale");
    expect(projectFix({ ...fix, accuracy: 300 }, geo, now).status).toBe(
      "low-accuracy",
    );
    expect(projectFix({ ...fix, latitude: 99 }, geo, now).status).toBe(
      "outside",
    );
  });
  it("propagates survey uncertainty instead of hiding it", () => {
    expect(projectFix(fix, geo, now)).toEqual({
      status: "ready",
      point: { x: 5, y: 5 },
      accuracy: 4,
    });
  });
});
describe("Extensibility boundaries", () => {
  it("searches additional data languages and falls back for untranslated labels", () => {
    const place = {
      ...room("А421"),
      name: { ru: "Библиотека", en: "Library", fr: "Bibliothèque" },
    };
    expect(searchPlaces([place], "Bibliothèque")[0].id).toBe(place.id);
    expect(localize(place.name, "fr")).toBe("Bibliothèque");
    expect(localize(place.name, "de")).toBe("Library");
    expect(localize({ ru: "Архив", en: " " }, "de")).toBe("Архив");
  });
  it("keeps floor zero in route guidance and search filters", () => {
    const r = graph(
      [node("upper", 1), { ...node("ground", 0), x: 10 }],
      [edge("stairs", "upper", "ground", 1, { kind: "stairs" })],
    ).find(["upper"], ["ground"]);
    if (!r.ok) throw Error("Fixture route is disconnected");
    const step = r.route.steps.find((s) => s.kind === "stairsDown")!;
    expect(stepLabel(step, "en")).toBe("Go down to floor 0");
    const p = { ...room("А421"), id: "ground-room", floor: 0 };
    expect(searchPlaces([p, room("А421")], "", { floor: 0 })).toEqual([p]);
  });
  it("rejects non-text translations before opening a new campus package", () => {
    const c = structuredClone(defaultCampus);
    (c.places[0].name as Record<string, unknown>).fr = { label: "Invalid" };
    expect(() => validateCampus(c)).toThrow("Invalid place");
  });
  it("provides English names and descriptions for the complete imported catalogue", () => {
    for (const place of defaultCampus.places) {
      expect(place.name.en, place.id).toBeTruthy();
      expect(/[А-Яа-яЁё]/.test(place.name.en), place.name.en).toBe(false);
      if (place.description.ru)
        expect(place.description.en, place.id).toBeTruthy();
    }
  });
  it("fits every building including the separate pool and dining hall", () => {
    const bounds = campusBounds(defaultCampus);
    for (const b of defaultCampus.buildings) {
      expect(b.bounds.x).toBeGreaterThanOrEqual(bounds.x);
      expect(b.bounds.y).toBeGreaterThanOrEqual(bounds.y);
      expect(b.bounds.x + b.bounds.width).toBeLessThanOrEqual(
        bounds.x + bounds.w,
      );
      expect(b.bounds.y + b.bounds.height).toBeLessThanOrEqual(
        bounds.y + bounds.h,
      );
    }
  });
  it("uses the destination landing coordinate on the destination floor", () => {
    const result = router.find(start.nodeIds, room("А421").nodeIds);
    if (!result.ok) throw Error("Fixture route is disconnected");
    const step = result.route.steps.find((s) => s.toFloor)!;
    expect(
      transitionPoint(result.route, step, step.toFloor!, router.nodes),
    ).toBe(router.nodes.get(result.route.nodeIds[step.pathIndex + 1]));
  });
  it("has complete interface dictionaries for every registered language", () => {
    for (const locale of localeCodes) {
      expect(Object.keys(messages[locale]).sort()).toEqual(
        Object.keys(messages.ru).sort(),
      );
      expect(Object.values(messages[locale]).every(Boolean)).toBe(true);
    }
  });
  it("rejects dangling graph references", () => {
    const c = structuredClone(defaultCampus);
    c.edges[0].to = "missing";
    expect(() => validateCampus(c)).toThrow("Invalid edge");
  });
  it("rejects duplicate IDs and invalid costs", () => {
    const c = structuredClone(defaultCampus);
    c.nodes.push(c.nodes[0]);
    expect(() => validateCampus(c)).toThrow();
    const d = structuredClone(defaultCampus);
    d.edges[0].cost = -1;
    expect(() => validateCampus(d)).toThrow();
  });
  it("rejects markup in imported SVG geometry", () => {
    const c = structuredClone(defaultCampus);
    c.geometry[0].footprint[0] = '"/><script>alert(1)</script>';
    expect(() => validateCampus(c)).toThrow("Invalid floor geometry");
  });
});
