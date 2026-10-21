import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { drivewayFor, pointOnRoad, scatterTrees, SITE } from "@/lib/3d/site";

const houses = SEED_UNITS.map((u) => ({ position: { x: u.position.x, z: u.position.z }, typology: u.typology, rotationY: u.position.rotationY }));

describe("site layout", () => {
  it("has exactly 13 seeded units with approved typology counts", () => {
    expect(SEED_UNITS).toHaveLength(13);
    const counts = SEED_UNITS.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.typology]: (acc[u.typology] ?? 0) + 1 }), {});
    expect(counts).toEqual({ T1: 3, T2: 3, T3: 4, T4: 3 });
  });

  it("places houses clear of the road band", () => {
    for (const unit of SEED_UNITS) {
      expect(pointOnRoad(unit.position.x, unit.position.z, 0)).toBe(false);
    }
  });

  it("connects every seeded house to the road network", () => {
    for (const unit of SEED_UNITS) {
      const driveway = drivewayFor({ x: unit.position.x, z: unit.position.z }, unit.typology, unit.position.rotationY);
      expect(driveway, `${unit.code} has no driveway`).not.toBeNull();
      expect(driveway!.length).toBeLessThan(20);
    }
  });

  it("scatters trees deterministically without hitting houses or roads", () => {
    const a = scatterTrees({ houses, count: 40, seed: 42 });
    const b = scatterTrees({ houses, count: 40, seed: 42 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    for (const tree of a) {
      expect(pointOnRoad(tree.x, tree.z, 2)).toBe(false);
      expect(Math.hypot(tree.x - SITE.center.x, tree.z - SITE.center.z)).toBeLessThan(90);
    }
  });

  it("keeps the plaza clear", () => {
    const trees = scatterTrees({ houses, count: 80, seed: 7 });
    for (const tree of trees) {
      expect(Math.hypot(tree.x - SITE.centralPlaza.x, tree.z - SITE.centralPlaza.z)).toBeGreaterThan(SITE.centralPlaza.radius);
    }
  });
});
