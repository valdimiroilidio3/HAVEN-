import { getFloorPlan } from "@/lib/domain/floorplans";
import type { Typology } from "@/lib/domain/types";

/**
 * Condominium masterplan layout (metres). Shared by the exterior scene, the
 * driveway generator, tree scattering and the scene editor grid.
 *
 * PROTOTYPE: the road ring, plot arrangement and landscape are demonstration
 * geometry, not a surveyed masterplan.
 */
export const SITE = {
  width: 96,
  depth: 92,
  center: { x: 0, z: 2 },
  /** Ring road band (axis-aligned approximation used for layout tests). */
  ring: {
    outer: { minX: -28.75, maxX: 28.75, minZ: -20.75, maxZ: 26.75, radius: 9 },
    inner: { minX: -23.25, maxX: 23.25, minZ: -15.25, maxZ: 21.25, radius: 3.5 },
    width: 5.5,
  },
  entrance: { minX: 23.25, maxX: 28.75, minZ: 26.75, maxZ: 46 },
  centralPlaza: { x: 0, z: 4, radius: 7 },
  gate: { x: 26, z: 40 },
} as const;

export type Vec2 = { x: number; z: number };

export function pointInRect(x: number, z: number, rect: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

export function pointInRingRoad(x: number, z: number, margin = 0): boolean {
  const o = SITE.ring.outer;
  const i = SITE.ring.inner;
  const inOuter = pointInRect(x, z, { minX: o.minX - margin, maxX: o.maxX + margin, minZ: o.minZ - margin, maxZ: o.maxZ + margin });
  const inInner = pointInRect(x, z, { minX: i.minX + margin, maxX: i.maxX - margin, minZ: i.minZ + margin, maxZ: i.maxZ - margin });
  return inOuter && !inInner;
}

export function pointOnRoad(x: number, z: number, margin = 0): boolean {
  return pointInRingRoad(x, z, margin) || pointInRect(x, z, SITE.entrance);
}

/** AABB half-extents of a rotated house footprint. */
export function footprintExtents(typology: Typology, rotationDeg: number) {
  const plan = getFloorPlan(typology);
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    hx: (plan.widthM / 2) * c + (plan.depthM / 2) * s,
    hz: (plan.widthM / 2) * s + (plan.depthM / 2) * c,
    width: plan.widthM,
    depth: plan.depthM,
  };
}

export function houseBounds(
  position: Vec2,
  typology: Typology,
  rotationDeg: number,
  margin = 0,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const { hx, hz } = footprintExtents(typology, rotationDeg);
  const extra = margin + 0.6;
  return {
    minX: position.x - hx - extra,
    maxX: position.x + hx + extra,
    minZ: position.z - hz - extra,
    maxZ: position.z + hz + extra,
  };
}

/** Direction the house entrance faces in world space. */
export function facingVector(rotationDeg: number): Vec2 {
  const rad = (rotationDeg * Math.PI) / 180;
  return { x: Math.sin(rad), z: Math.cos(rad) };
}

export interface Driveway {
  x: number;
  z: number;
  length: number;
  width: number;
  rotationY: number;
}

/**
 * Compute a driveway from the house façade to the nearest road band.
 * Returns null when no road is found within range (the editor may place a
 * property in an unserviced location).
 */
export function drivewayFor(position: Vec2, typology: Typology, rotationDeg: number): Driveway | null {
  const plan = getFloorPlan(typology);
  const rad = (rotationDeg * Math.PI) / 180;
  const dir = facingVector(rotationDeg);
  const frontDistance = (plan.depthM / 2) * Math.abs(Math.cos(rad)) + (plan.widthM / 2) * Math.abs(Math.sin(rad));
  const startX = position.x + dir.x * frontDistance;
  const startZ = position.z + dir.z * frontDistance;
  let reached: number | null = null;
  for (let t = 0; t <= 26; t += 0.25) {
    const px = startX + dir.x * t;
    const pz = startZ + dir.z * t;
    if (pointOnRoad(px, pz, 0.2)) {
      reached = t;
      break;
    }
  }
  if (reached === null) return null;
  const length = Math.max(reached, 0.4) + 0.4;
  return {
    x: startX + dir.x * (length / 2) - dir.x * 0.2,
    z: startZ + dir.z * (length / 2) - dir.z * 0.2,
    length,
    width: 3.4,
    rotationY: rotationDeg,
  };
}

/* ── Deterministic landscape scatter ──────────────────────────────────── */

/** Small, fast, deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TreeInstance {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  variant: 0 | 1 | 2;
}

export interface ScatterInput {
  houses: Array<{ position: Vec2; typology: Typology; rotationY: number }>;
  count?: number;
  seed?: number;
  /** Restrict to a region (e.g. the inner garden). */
  region?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function scatterTrees({ houses, count = 120, seed = 20261021, region }: ScatterInput): TreeInstance[] {
  const rand = mulberry32(seed);
  const bounds = region ?? { minX: -47, maxX: 47, minZ: -43, maxZ: 45 };
  const houseBoxes = houses.map((h) => houseBounds(h.position, h.typology, h.rotationY, 3.6));
  const trees: TreeInstance[] = [];
  let attempts = 0;
  const maxAttempts = count * 40;

  while (trees.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rand() * (bounds.maxZ - bounds.minZ);
    if (pointOnRoad(x, z, 2.4)) continue;
    // Keep the central plaza open.
    if (Math.hypot(x - SITE.centralPlaza.x, z - SITE.centralPlaza.z) < SITE.centralPlaza.radius + 1.5) continue;
    if (houseBoxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    trees.push({
      x: round(x),
      z: round(z),
      scale: round(0.75 + rand() * 0.9),
      rotation: round(rand() * Math.PI * 2, 3),
      variant: Math.floor(rand() * 3) as 0 | 1 | 2,
    });
  }
  return trees;
}

export function scatterShrubs(houses: ScatterInput["houses"], seed = 7717): TreeInstance[] {
  return scatterTrees({ houses, count: 55, seed, region: { minX: -46, maxX: 46, minZ: -42, maxZ: 44 } }).map((t) => ({
    ...t,
    scale: round(t.scale * 0.32, 2),
    variant: (t.variant % 2) as 0 | 1,
  }));
}

function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/** Sample points along the ring road for lamps and planting beds. */
export function lampPositions(): Vec2[] {
  const positions: Vec2[] = [];
  const zNorth = -18;
  const zSouth = 24;
  for (let x = -18; x <= 18; x += 12) {
    positions.push({ x, z: zNorth });
    positions.push({ x, z: zSouth });
  }
  for (let z = -8; z <= 14; z += 11) {
    positions.push({ x: -26, z });
    positions.push({ x: 26, z });
  }
  return positions;
}
