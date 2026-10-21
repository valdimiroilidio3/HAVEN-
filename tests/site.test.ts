import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { SITE_BOUNDS } from "@/lib/domain/validation";
import {
  COURTS,
  PLANTING_BEDS,
  SITE,
  courtBounds,
  drivewayFor,
  houseBounds,
  pointOnRoad,
  scatterFlowers,
  scatterTrees,
  sportsKeepOut,
} from "@/lib/3d/site";

const houses = SEED_UNITS.map((u) => ({
  position: { x: u.position.x, z: u.position.z },
  typology: u.typology,
  rotationY: u.position.rotationY,
}));

const intersects = (
  a: { minX: number; maxX: number; minZ: number; maxZ: number },
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
) => a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;

const inFence = (x: number, z: number) =>
  x > SITE.fence.minX && x < SITE.fence.maxX && z > SITE.fence.minZ && z < SITE.fence.maxZ;

describe("site layout", () => {
  it("has exactly 13 seeded units with approved typology counts", () => {
    expect(SEED_UNITS).toHaveLength(13);
    const counts = SEED_UNITS.reduce<Record<string, number>>(
      (acc, u) => ({ ...acc, [u.typology]: (acc[u.typology] ?? 0) + 1 }),
      {},
    );
    expect(counts).toEqual({ T1: 3, T2: 3, T3: 4, T4: 3 });
  });

  it("keeps every house footprint off every carriageway", () => {
    for (const unit of SEED_UNITS) {
      const box = houseBounds(unit.position, unit.typology, unit.position.rotationY, 0);
      for (let x = box.minX + 0.5; x < box.maxX; x += 1) {
        for (let z = box.minZ + 0.5; z < box.maxZ; z += 1) {
          expect(pointOnRoad(x, z, 0), `${unit.code} footprint over the road at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
        }
      }
    }
  });

  it("connects every seeded house to the road network", () => {
    for (const unit of SEED_UNITS) {
      const driveway = drivewayFor({ x: unit.position.x, z: unit.position.z }, unit.typology, unit.position.rotationY);
      expect(driveway, `${unit.code} has no driveway`).not.toBeNull();
      expect(driveway!.length).toBeLessThan(24);
    }
  });

  it("shares one source of truth for the placement bounds", () => {
    expect(SITE.fence).toEqual(SITE_BOUNDS);
    for (const unit of SEED_UNITS) {
      expect(unit.position.x).toBeGreaterThanOrEqual(SITE_BOUNDS.minX);
      expect(unit.position.x).toBeLessThanOrEqual(SITE_BOUNDS.maxX);
      expect(unit.position.z).toBeGreaterThanOrEqual(SITE_BOUNDS.minZ);
      expect(unit.position.z).toBeLessThanOrEqual(SITE_BOUNDS.maxZ);
    }
  });

  it("keeps every house inside the perimeter fence", () => {
    for (const unit of SEED_UNITS) {
      const box = houseBounds(unit.position, unit.typology, unit.position.rotationY, 0);
      expect(box.minX).toBeGreaterThan(SITE.fence.minX);
      expect(box.maxX).toBeLessThan(SITE.fence.maxX);
      expect(box.minZ).toBeGreaterThan(SITE.fence.minZ);
      expect(box.maxZ).toBeLessThan(SITE.fence.maxZ);
    }
  });

  it("stacks three pitches in the sports park without overlap", () => {
    expect(COURTS.map((court) => court.kind)).toEqual(["football", "basketball", "futsal"]);
    for (let i = 0; i < COURTS.length; i += 1) {
      const a = courtBounds(COURTS[i]!);
      expect(inFence(a.minX, a.minZ)).toBe(true);
      expect(inFence(a.maxX, a.maxZ)).toBe(true);
      // Courts sit west of the circuit road and clear of the housing rows.
      expect(a.maxX).toBeLessThan(SITE.ring.outer.minX);
      for (const unit of SEED_UNITS) {
        expect(
          intersects(a, houseBounds(unit.position, unit.typology, unit.position.rotationY, 0)),
          `${COURTS[i]!.kind} court clashes with ${unit.code}`,
        ).toBe(false);
      }
      for (let j = i + 1; j < COURTS.length; j += 1) {
        expect(intersects(a, courtBounds(COURTS[j]!))).toBe(false);
      }
    }
  });

  it("gives every tree and shrub clear ground inside a planting bed", () => {
    const trees = scatterTrees({ houses, count: 96, keepOut: sportsKeepOut() });
    expect(trees).toEqual(scatterTrees({ houses, count: 96, keepOut: sportsKeepOut() }));
    expect(trees.length).toBeGreaterThan(60);
    for (const tree of trees) {
      const inBed = PLANTING_BEDS.some(
        (bed) => tree.x >= bed.minX && tree.x <= bed.maxX && tree.z >= bed.minZ && tree.z <= bed.maxZ,
      );
      expect(inBed, `tree at ${tree.x},${tree.z} outside every bed`).toBe(true);
      expect(pointOnRoad(tree.x, tree.z, 2.4)).toBe(false);
      expect(inFence(tree.x, tree.z)).toBe(true);
      for (const unit of SEED_UNITS) {
        expect(
          intersects(
            { minX: tree.x - 1, maxX: tree.x + 1, minZ: tree.z - 1, maxZ: tree.z + 1 },
            houseBounds(unit.position, unit.typology, unit.position.rotationY, 0),
          ),
          `tree at ${tree.x},${tree.z} overlaps ${unit.code}`,
        ).toBe(false);
      }
      for (const court of COURTS) {
        expect(intersects({ minX: tree.x - 1, maxX: tree.x + 1, minZ: tree.z - 1, maxZ: tree.z + 1 }, courtBounds(court))).toBe(false);
      }
    }
  });

  it("keeps flowers inside the beds and off the roads", () => {
    const flowers = scatterFlowers();
    expect(flowers.length).toBeGreaterThan(60);
    for (const flower of flowers) {
      expect(pointOnRoad(flower.x, flower.z, 0)).toBe(false);
      expect(inFence(flower.x, flower.z)).toBe(true);
      for (const unit of SEED_UNITS) {
        expect(
          intersects(
            { minX: flower.x - 0.3, maxX: flower.x + 0.3, minZ: flower.z - 0.3, maxZ: flower.z + 0.3 },
            houseBounds(unit.position, unit.typology, unit.position.rotationY, 0),
          ),
        ).toBe(false);
      }
    }
  });

  it("keeps the lagoon clear of the circuit and the houses", () => {
    const { x, z, radiusX, radiusZ, deck } = SITE.lagoon;
    expect(pointOnRoad(x, z - (radiusZ + deck + 1), 0)).toBe(false);
    expect(pointOnRoad(x, z + (radiusZ + deck + 1), 0)).toBe(false);
    for (const unit of SEED_UNITS) {
      const box = houseBounds(unit.position, unit.typology, unit.position.rotationY, 0);
      expect(box.minX > x + radiusX + deck || box.maxX < x - radiusX - deck || box.minZ > z + radiusZ + deck || box.maxZ < z - radiusZ - deck).toBe(true);
    }
  });
});
