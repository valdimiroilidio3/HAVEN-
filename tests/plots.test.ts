import { describe, expect, it } from "vitest";
import {
  footprintExtents,
  GARDEN_BOUNDS,
  PLOT,
  plotRearDepth,
  plotWallsFor,
  poolFor,
  poolKeepOut,
  poolWorld,
  scatterTrees,
  TREE_KINDS,
  type TreeKind,
} from "@/lib/3d/site";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { getFloorPlan } from "@/lib/domain/floorplans";
import { TYPOLOGIES } from "@/lib/domain/types";

const unit = (code: string) => {
  const found = SEED_UNITS.find((entry) => entry.code === code);
  if (!found) throw new Error(`missing seed unit ${code}`);
  return found;
};

describe("private plots", () => {
  it("gives every home a deterministic set of boundary walls", () => {
    for (const typology of TYPOLOGIES) {
      const walls = plotWallsFor(typology);
      expect(walls).toHaveLength(3);
      expect(walls).toEqual(plotWallsFor(typology));
      const plan = getFloorPlan(typology);
      // Side walls sit outside the façade and enclose a rear garden.
      const side = walls.filter((wall) => wall.width < wall.depth);
      expect(side).toHaveLength(2);
      for (const wall of side) {
        expect(Math.abs(wall.x)).toBeCloseTo(plan.widthM / 2 + PLOT.sideMargin, 5);
        expect(wall.depth / 2).toBeGreaterThan(plan.depthM / 2);
      }
      const rear = walls.find((wall) => wall.width > wall.depth)!;
      expect(rear.z).toBeCloseTo(-(plan.depthM / 2 + PLOT.rearDepth), 5);
      expect(rear.width).toBeCloseTo(plan.widthM + PLOT.sideMargin * 2, 5);
    }
  });

  it("assigns pools deterministically and fits them inside the plot", () => {
    for (const seed of SEED_UNITS) {
      const first = poolFor(seed.code, seed.typology);
      expect(poolFor(seed.code, seed.typology)).toEqual(first);
      if (!first) continue;
      const plan = getFloorPlan(seed.typology);
      expect(first.z + first.depth / 2 + first.deck).toBeLessThanOrEqual(-(plan.depthM / 2) + 0.001);
      expect(first.z - first.depth / 2 - first.deck).toBeGreaterThanOrEqual(-(plan.depthM / 2 + PLOT.rearDepth));
      expect(Math.abs(first.x) + first.width / 2 + first.deck).toBeLessThanOrEqual(plan.widthM / 2 + PLOT.sideMargin);
    }
  });

  it("never gives a T1 a pool", () => {
    for (const seed of SEED_UNITS.filter((entry) => entry.typology === "T1")) {
      expect(poolFor(seed.code, seed.typology)).toBeNull();
    }
  });

  it("gives some houses a pool and some not", () => {
    const pools = SEED_UNITS.filter((seed) => poolFor(seed.code, seed.typology));
    expect(pools.length).toBeGreaterThan(0);
    expect(pools.length).toBeLessThan(SEED_UNITS.length);
  });

  it("rotates pool coordinates with the house", () => {
    const pool = poolFor("H03", "T3");
    if (!pool) return;
    const straight = poolWorld(pool, { x: 0, z: 0 }, 0);
    expect(straight.x).toBeCloseTo(pool.x, 1);
    expect(straight.z).toBeCloseTo(pool.z, 1);
    const turned = poolWorld(pool, { x: 10, z: 0 }, 90);
    expect(turned.x).toBeCloseTo(10 + pool.z, 1);
    expect(turned.z).toBeCloseTo(-pool.x, 1);
    expect(turned.rotationY).toBe(90);
  });

  it("keeps keep-out circles clear of the pool water", () => {
    const pool = poolFor("H03", "T3");
    if (!pool) return;
    const zone = poolKeepOut(pool, { x: 0, z: 0 }, 0);
    expect(zone.radius).toBeGreaterThan(Math.max(pool.width, pool.depth) / 2);
  });
});

describe("plot layout", () => {
  const unit = (code: string) => SEED_UNITS.find((entry) => entry.code === code)!;

  const worldBox = (seed: (typeof SEED_UNITS)[number], x: number, z: number, width: number, depth: number) => {
    const rad = (seed.position.rotationY * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const hx = (width / 2) * c + (depth / 2) * s;
    const hz = (width / 2) * s + (depth / 2) * c;
    const ox = x * Math.cos(rad) + z * Math.sin(rad);
    const oz = -x * Math.sin(rad) + z * Math.cos(rad);
    return {
      minX: seed.position.x + ox - hx,
      maxX: seed.position.x + ox + hx,
      minZ: seed.position.z + oz - hz,
      maxZ: seed.position.z + oz + hz,
    };
  };

  const footprintOf = (seed: (typeof SEED_UNITS)[number]) => {
    const { hx, hz } = footprintExtents(seed.typology, seed.position.rotationY);
    return {
      minX: seed.position.x - hx,
      maxX: seed.position.x + hx,
      minZ: seed.position.z - hz,
      maxZ: seed.position.z + hz,
    };
  };

  const intersects = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: typeof a) =>
    a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;

  it("keeps every plot wall inside the fence and clear of neighbouring homes", () => {
    for (const seed of SEED_UNITS) {
      const rearDepth = plotRearDepth(seed.position, seed.position.rotationY, seed.typology);
      for (const wall of plotWallsFor(seed.typology, rearDepth)) {
        const box = worldBox(seed, wall.x, wall.z, wall.width, wall.depth);
        expect(box.minX).toBeGreaterThanOrEqual(GARDEN_BOUNDS.minX - 1e-6);
        expect(box.maxX).toBeLessThanOrEqual(GARDEN_BOUNDS.maxX + 1e-6);
        expect(box.minZ).toBeGreaterThanOrEqual(GARDEN_BOUNDS.minZ - 1e-6);
        expect(box.maxZ).toBeLessThanOrEqual(GARDEN_BOUNDS.maxZ + 1e-6);
        for (const other of SEED_UNITS) {
          if (other.code === seed.code) continue;
          expect(
            intersects(box, footprintOf(other)),
            `${seed.code} plot wall intrudes on ${other.code}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps pools clear of roads and neighbouring homes", () => {
    const withPools = SEED_UNITS.filter((seed) => poolFor(seed.code, seed.typology));
    expect(withPools.length).toBeGreaterThanOrEqual(4);
    for (const seed of withPools) {
      const pool = poolFor(seed.code, seed.typology)!;
      const box = worldBox(
        seed,
        pool.x,
        pool.z,
        pool.width + pool.deck * 2,
        pool.depth + pool.deck * 2,
      );
      for (const other of SEED_UNITS) {
        if (other.code === seed.code) continue;
        expect(intersects(box, footprintOf(other)), `${seed.code} pool intrudes on ${other.code}`).toBe(false);
      }
      expect(box.minX).toBeGreaterThanOrEqual(GARDEN_BOUNDS.minX);
      expect(box.maxX).toBeLessThanOrEqual(GARDEN_BOUNDS.maxX);
      expect(box.minZ).toBeGreaterThanOrEqual(GARDEN_BOUNDS.minZ);
      expect(box.maxZ).toBeLessThanOrEqual(GARDEN_BOUNDS.maxZ);
      // The entrance drive runs along the east edge of the front row.
      const entrance = { minX: 23.25, maxX: 28.75, minZ: 26.75, maxZ: 55 };
      expect(intersects(box, entrance), `${seed.code} pool sits on the entrance drive`).toBe(false);
    }
  });
});

describe("tree species", () => {
  it("uses clustered species and stays deterministic", () => {
    const houses = SEED_UNITS.map((seed) => ({ position: seed.position, typology: seed.typology, rotationY: seed.position.rotationY }));
    const trees = scatterTrees({ houses, count: 60, seed: 99 });
    expect(trees).toEqual(scatterTrees({ houses, count: 60, seed: 99 }));
    const kinds = new Set(trees.map((tree) => tree.kind));
    for (const kind of kinds) expect(TREE_KINDS).toContain(kind as TreeKind);
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("respects keep-out zones such as swimming pools", () => {
    const houses = SEED_UNITS.map((seed) => ({ position: seed.position, typology: seed.typology, rotationY: seed.position.rotationY }));
    const zone = { x: 0, z: 0, radius: 120 };
    const trees = scatterTrees({ houses, count: 25, seed: 5, keepOut: [zone] });
    expect(trees).toHaveLength(0);
  });
});
