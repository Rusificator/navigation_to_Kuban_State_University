import { describe, expect, it } from "vitest";
import {
  defaultCampus as campus,
  validateCampus,
} from "../src/data/repository";
import { Router } from "../src/domain/router";
import { searchPlaces } from "../src/domain/search";
import { campusBounds } from "../src/domain/mapGeometry";
import { stepLabel } from "../src/i18n";
import outdoors from "../src/data/outdoors.json";
import curation from "../src/data/curation.json";
const place = (id: string) => campus.places.find((p) => p.id === id)!;
const router = new Router(campus);
describe("Reviewed catalogue", () => {
  it("keeps exactly one mobilisation office in 215 on main floor 2", () => {
    for (const q of [
      "моб отдел",
      "мобилизационный",
      "mobilisation",
      "mobilization",
    ])
      expect(searchPlaces(campus.places, q).map((p) => p.id)).toEqual([
        "rect9524",
      ]);
    expect(place("rect9524")).toMatchObject({
      originalName: "215",
      floor: 2,
      buildingId: "main",
    });
    expect(place("rect9522").description.ru).not.toMatch(/мобилизац/i);
  });
  it("keeps one reading room in S wing and clears stale assignments", () => {
    for (const q of ["читальный зал", "reading room"])
      expect(searchPlaces(campus.places, q).map((p) => p.id)).toEqual([
        "rect10857",
      ]);
    expect(place("rect10857")).toMatchObject({ floor: 1, buildingId: "C" });
    expect(place("rect10875").description.ru).toBe("");
    expect(place("rect10202").description.ru).toBe("");
  });
  it("uses the source canonical index while preserving distinct facilities", () => {
    for (const n of curation.duplicateNumbers) {
      const matches = campus.places.filter((p) => p.originalName === n);
      expect(matches).toHaveLength(2);
      expect(matches.filter((p) => p.searchable !== false)).toHaveLength(1);
      expect(
        matches.find((p) => p.catalogStatus === "unresolved")!.aliases,
      ).toEqual([]);
    }
    expect(
      campus.places.filter((p) => p.originalName === "Ж" && p.searchable),
    ).toHaveLength(17);
    expect(searchPlaces(campus.places, "буфет").length).toBeGreaterThan(2);
  });
  it("enriches existing cards and preserves the separate staff trade union", () => {
    expect(searchPlaces(campus.places, "буфет 10")[0].id).toBe("rect9767");
    expect(
      searchPlaces(campus.places, "профком студентов").map((p) => p.id),
    ).toEqual(["rect9518"]);
    expect(searchPlaces(campus.places, "профком сотрудников")[0].id).toBe(
      "rect9500",
    );
    expect(searchPlaces(campus.places, "технопарк")[0].id).toBe("rect10669");
  });
});
describe("Joined L wing", () => {
  it("routes both ways via floor 2 without going outside", () => {
    expect(campus.buildings.find((b) => b.id === "L")?.parentBuildingId).toBe(
      "main",
    );
    for (const target of ["building-L", "rect9773"])
      for (const [a, b] of [
        ["rect10827", target],
        [target, "rect10827"],
      ]) {
        const result = router.find(place(a).nodeIds, place(b).nodeIds);
        if (!result.ok) throw Error("Indoor route disconnected");
        const r = result.route;
        expect(r.nodeIds).toContain("curated-main-l-landing");
        expect(
          r.nodeIds.every(
            (id) => router.nodes.get(id)!.environment === "indoor",
          ),
        ).toBe(true);
        const step = r.steps.find((s) => s.kind === "passage")!;
        expect(step.floor).toBe(2);
        expect(stepLabel(step, "ru")).toContain("корпусом Л");
        expect(stepLabel(step, "en")).toContain("L wing");
        expect(r.distanceMeters).toBeNull();
      }
  });
  it("does not promise unverified wheelchair access", () => {
    expect(
      router.find(
        place("rect10827").nodeIds,
        place("building-L").nodeIds,
        "stepFree",
      ),
    ).toEqual({ ok: false, reason: "accessibility-unverified" });
  });
});
describe("Campus landmarks", () => {
  it("includes eight new places in overview bounds and keeps the stadium flat", () => {
    const b = campusBounds(campus),
      places = campus.places.filter((p) => p.environment === "outdoor");
    expect(places).toHaveLength(8);
    for (const p of places) {
      expect(p.floor).toBeNull();
      expect(p.buildingId).toBeNull();
      expect(p.x).toBeGreaterThanOrEqual(b.x);
      expect(p.y).toBeGreaterThanOrEqual(b.y);
      expect(p.x + p.width).toBeLessThanOrEqual(b.x + b.w);
      expect(p.y + p.height).toBeLessThanOrEqual(b.y + b.h);
    }
    expect(b.y).toBeLessThan(50);
    const stadium = campus.contextShapes.filter(
      (s) => s.placeId === "campus-stadium",
    );
    expect(stadium.every((s) => s.levels === 0)).toBe(true);
    expect(stadium.some((s) => s.kind === "marking" && s.transform)).toBe(true);
  });
  it("links actual OSM identities without guessing doors", () => {
    const ids = new Set(
      [...outdoors.features, ...outdoors.pois].map((p) => p.id),
    );
    for (const p of campus.places)
      for (const id of p.outdoorFeatureIds ?? [])
        expect(ids.has(id)).toBe(true);
    expect(searchPlaces(campus.places, "стадион")[0].id).toBe("campus-stadium");
    expect(searchPlaces(campus.places, "dorm 4")[0].id).toBe("campus-dorm-4");
    expect(
      router.find(place("rect10827").nodeIds, place("campus-stadium").nodeIds),
    ).toEqual({ ok: false, reason: "invalid-point" });
  });
  it("rejects bad evidence, cycles, unsafe links and nonfinite geometry", () => {
    for (const change of [
      (c: typeof campus) => {
        c.places[0].evidenceIds = ["missing-source"];
      },
      (c: typeof campus) => {
        c.buildings.find((b) => b.id === "main")!.parentBuildingId = "L";
      },
      (c: typeof campus) => {
        c.evidenceSources![0].url = "javascript:alert(1)";
      },
      (c: typeof campus) => {
        c.contextShapes[0].transform = [1, 0, 0, 1, Infinity, 0];
      },
      (c: typeof campus) => {
        c.places[0].floor = null;
      },
    ]) {
      const c = structuredClone(campus);
      change(c);
      expect(() => validateCampus(c)).toThrow();
    }
  });
});
