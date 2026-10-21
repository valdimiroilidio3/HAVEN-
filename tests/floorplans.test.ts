import { describe, expect, it } from "vitest";
import { FLOOR_PLANS, getFloorPlan } from "@/lib/domain/floorplans";
import { TYPOLOGY_CATALOGUE } from "@/lib/domain/constants";
import { deriveOpenings, deriveWalls, validatePlan } from "@/lib/domain/plan-geometry";
import { TYPOLOGIES } from "@/lib/domain/types";

describe("floor plan specifications", () => {
  it.each(TYPOLOGIES)("%s is geometrically valid", (typology) => {
    const plan = getFloorPlan(typology);
    const issues = validatePlan(plan);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it.each(TYPOLOGIES)("%s has at least one entrance door", (typology) => {
    const plan = getFloorPlan(typology);
    const doors = plan.openings.filter((o) => o.type === "door" && o.id.includes("entry"));
    expect(doors.length).toBeGreaterThan(0);
  });

  it("matches the approved typology counts", () => {
    let total = 0;
    const counts: Record<string, number> = {};
    for (const typology of TYPOLOGIES) {
      counts[typology] = TYPOLOGY_CATALOGUE[typology].homes;
      total += TYPOLOGY_CATALOGUE[typology].homes;
    }
    counts.total = total;
    expect(counts).toMatchObject({ T1: 3, T2: 3, T3: 4, T4: 3, total: 13 });
  });

  it.each(TYPOLOGIES)("%s walls are deduplicated and carved", (typology) => {
    const plan = getFloorPlan(typology);
    const walls = deriveWalls(plan);
    expect(walls.length).toBeGreaterThan(6);
    const exterior = walls.filter((w) => w.exterior);
    expect(exterior.length).toBeGreaterThan(0);
    // Every wall must have at least one solid component (no wall fully erased).
    expect(walls.every((w) => w.components.length > 0)).toBe(true);
    const openings = deriveOpenings(plan);
    expect(openings.length).toBeGreaterThan(5);
    expect(openings.every((o) => o.end > o.start && o.top > o.bottom)).toBe(true);
  });

  it.each(TYPOLOGIES)("%s furniture lies inside the footprint", (typology) => {
    const plan = FLOOR_PLANS[typology];
    const halfW = plan.widthM / 2 + 4;
    const halfD = plan.depthM / 2 + 4;
    expect(plan.furniture.length).toBeGreaterThan(10);
    for (const piece of plan.furniture) {
      expect(Math.abs(piece.x)).toBeLessThanOrEqual(halfW);
      expect(Math.abs(piece.z)).toBeLessThanOrEqual(halfD);
    }
  });

  it("is deterministic", () => {
    expect(getFloorPlan("T3")).toEqual(getFloorPlan("T3"));
  });

  it("has a unique room id per plan", () => {
    for (const typology of TYPOLOGIES) {
      const ids = getFloorPlan(typology).rooms.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
