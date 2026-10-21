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
  width: 120,
  depth: 116,
  center: { x: 0, z: 2 },
  /** Perimeter fence. Private plots are clipped to this rectangle. */
  fence: { minX: -58, maxX: 58, minZ: -53, maxZ: 59 },
  /** Ring road band (axis-aligned approximation used for layout tests). */
  ring: {
    outer: { minX: -28.75, maxX: 28.75, minZ: -20.75, maxZ: 26.75, radius: 9 },
    inner: { minX: -23.25, maxX: 23.25, minZ: -15.25, maxZ: 21.25, radius: 3.5 },
    width: 5.5,
  },
  entrance: { minX: 23.25, maxX: 28.75, minZ: 26.75, maxZ: 59 },
  centralPlaza: { x: 0, z: 4, radius: 7 },
  gate: { x: 26, z: 59 },
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
export function drivewayFor(position: Vec2, typology: Typology, rotationDeg: number, lateral = 0): Driveway | null {
  const plan = getFloorPlan(typology);
  const rad = (rotationDeg * Math.PI) / 180;
  const dir = facingVector(rotationDeg);
  const side = { x: Math.cos(rad), z: -Math.sin(rad) };
  const frontDistance = (plan.depthM / 2) * Math.abs(Math.cos(rad)) + (plan.widthM / 2) * Math.abs(Math.sin(rad));
  const startX = position.x + side.x * lateral + dir.x * frontDistance;
  const startZ = position.z + side.z * lateral + dir.z * frontDistance;
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

/** Tree silhouette families. Kept explicit so the renderer can build four
 *  merged canopies and vary colour per instance. */
export const TREE_KINDS = ["broadleaf", "conifer", "poplar", "olive"] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

export interface TreeInstance {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  variant: 0 | 1 | 2;
  kind: TreeKind;
}

export interface ScatterInput {
  houses: Array<{ position: Vec2; typology: Typology; rotationY: number }>;
  count?: number;
  seed?: number;
  /** Restrict to a region (e.g. the inner garden). */
  region?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Circular keep-out areas in world space (pools, patios, play areas). */
  keepOut?: Array<{ x: number; z: number; radius: number }>;
}

export function scatterTrees({ houses, count = 120, seed = 20261021, region, keepOut = [] }: ScatterInput): TreeInstance[] {
  const rand = mulberry32(seed);
  const bounds = region ?? { minX: -57, maxX: 57, minZ: -52, maxZ: 58 };
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
    if (keepOut.some((zone) => Math.hypot(zone.x - x, zone.z - z) < zone.radius)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    const variant = Math.floor(rand() * 3) as 0 | 1 | 2;
    // Cluster species so the planting reads as a designed landscape rather than
    // confetti: the north edge is olive and pine, the inner garden broadleaf.
    const speciesRoll = rand();
    const kind: TreeKind =
      z < -18 ? (speciesRoll < 0.45 ? "olive" : speciesRoll < 0.8 ? "conifer" : "broadleaf")
      : z > 18 ? (speciesRoll < 0.4 ? "poplar" : speciesRoll < 0.72 ? "broadleaf" : "olive")
      : speciesRoll < 0.62 ? "broadleaf" : speciesRoll < 0.82 ? "olive" : speciesRoll < 0.94 ? "poplar" : "conifer";
    trees.push({
      x: round(x),
      z: round(z),
      scale: round(0.75 + rand() * 0.9),
      rotation: round(rand() * Math.PI * 2, 3),
      variant,
      kind,
    });
  }
  return trees;
}

export function scatterShrubs(houses: ScatterInput["houses"], seed = 7717): TreeInstance[] {
  return scatterTrees({ houses, count: 44, seed, region: { minX: -56, maxX: 56, minZ: -51, maxZ: 57 } }).map((t) => ({
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

/* ── Private plots: boundaries and swimming pools ─────────────────────── */

/** Depth of the private rear garden, measured from the façade. */
export const PLOT = {
  /**
   * Distance from the house footprint edge to the side boundary wall. Kept
   * tight: neighbouring homes on the front row stand only ~1 m apart, so a
   * generous margin would push the party walls into the next house.
   */
  sideMargin: 0.5,
  /** Distance from the rear façade to the rear boundary wall. */
  rearDepth: 5.2,
  wallHeight: 1.15,
  wallThickness: 0.28,
  /** Small return along the street so each plot reads as enclosed. */
  frontReturn: 2.6,
} as const;

export interface PoolSpec {
  /** Local width (along the house façade, ±X). */
  width: number;
  /** Local depth (away from the house, −Z). */
  depth: number;
  /** Local centre of the water, relative to the house origin. */
  x: number;
  z: number;
  /** Deck (coping) around the water. */
  deck: number;
}

export interface PoolWorld {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotationY: number;
}

/** Usable site rectangle for private gardens (inside the perimeter wall). */
export const GARDEN_BOUNDS = { minX: -57.4, maxX: 57.4, minZ: -52.4, maxZ: 58.3 } as const;

/**
 * How far a house can extend its rear garden before reaching the perimeter.
 * Units on the outer ring face the fence, so their gardens are shallower than
 * the inner ones; clamping here keeps every wall and pool inside the site.
 */
export function plotRearDepth(position: Vec2, rotationY: number, typology: Typology): number {
  const plan = getFloorPlan(typology);
  const rad = (rotationY * Math.PI) / 180;
  const rearDir = { x: -Math.sin(rad), z: -Math.cos(rad) };
  let limit = Number.POSITIVE_INFINITY;
  if (rearDir.x > 1e-6) limit = Math.min(limit, (GARDEN_BOUNDS.maxX - position.x) / rearDir.x);
  if (rearDir.x < -1e-6) limit = Math.min(limit, (GARDEN_BOUNDS.minX - position.x) / rearDir.x);
  if (rearDir.z > 1e-6) limit = Math.min(limit, (GARDEN_BOUNDS.maxZ - position.z) / rearDir.z);
  if (rearDir.z < -1e-6) limit = Math.min(limit, (GARDEN_BOUNDS.minZ - position.z) / rearDir.z);
  const available = limit - plan.depthM / 2 - 0.7;
  return round(Math.max(1.8, Math.min(PLOT.rearDepth, available)), 2);
}

/**
 * Clear distance in front of the façade, i.e. the depth available between the
 * house and the road band. Cars are parked here, so it drives the garage size.
 */
export function frontGap(position: Vec2, rotationY: number, typology: Typology, lateral = 0): number {
  const plan = getFloorPlan(typology);
  const rad = (rotationY * Math.PI) / 180;
  const dir = facingVector(rotationY);
  const side = { x: Math.cos(rad), z: -Math.sin(rad) };
  const facade = (plan.depthM / 2) * Math.abs(Math.cos(rad)) + (plan.widthM / 2) * Math.abs(Math.sin(rad));
  const startX = position.x + side.x * lateral;
  const startZ = position.z + side.z * lateral;
  for (let t = 0; t <= 40; t += 0.2) {
    if (pointOnRoad(startX + dir.x * (facade + t), startZ + dir.z * (facade + t), 0.2)) return round(t, 2);
  }
  return 0;
}

/**
 * Offset of the parking bay from the house axis, in local coordinates. It sits
 * beside the entrance so the front door and its canopy stay clear, and stays
 * inside the plot boundary wall.
 */
export function garageLateral(typology: Typology): number {
  const plan = getFloorPlan(typology);
  const half = typology === "T3" || typology === "T4" ? 2.6 : 1.8;
  return round(plan.widthM / 2 + PLOT.sideMargin - half - 0.7, 2);
}

export interface GarageSpec {
  /** Local footprint (front = +Z). */
  width: number;
  depth: number;
  /** Local centre of the parking bay: beside the entrance, clear of the door. */
  x: number;
  z: number;
  /** 1 or 2 parked cars. */
  bays: 1 | 2;
  /** Larger homes get side walls and a lintel; smaller ones a light carport. */
  walled: boolean;
}

/**
 * A garage sized to the space actually available in front of the house — a
 * closed double garage for T3/T4, a one-car carport for T1/T2. Returns null
 * when the plot has no room for a car, so nothing ever protrudes into the road.
 */
export function garageFor(typology: Typology, gap: number, lateral: number = garageLateral(typology)): GarageSpec | null {
  const plan = getFloorPlan(typology);
  const bays: 1 | 2 = typology === "T3" || typology === "T4" ? 2 : 1;
  // Leave a 0.25 m setback from the kerb including the roof overhang.
  const depth = Math.min(bays === 2 ? 5.6 : 5.0, gap - 0.8);
  if (depth < 3.8) return null;
  return {
    width: bays === 2 ? 5.2 : 3.6,
    depth: round(depth, 2),
    x: lateral,
    z: round(plan.depthM / 2 + 0.35 + depth / 2, 2),
    bays,
    walled: bays === 2,
  };
}

function codeHash(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Choose the side of the entrance for the parking bay: both sides of the house
 * are tried and the deeper bay wins. Corner plots (H08, H12) only reach a road
 * on one side, so the choice is not cosmetic.
 */
export function garagePlan(position: Vec2, rotationY: number, typology: Typology): { garage: GarageSpec | null; lateral: number } {
  const base = garageLateral(typology);
  let best: { garage: GarageSpec | null; lateral: number } = { garage: null, lateral: base };
  for (const lateral of [base, -base]) {
    const garage = garageFor(typology, frontGap(position, rotationY, typology, lateral), lateral);
    if (garage && garage.depth > (best.garage?.depth ?? 0)) best = { garage, lateral };
  }
  return best;
}

/**
 * Deterministic private pool assignment.
 *  - T4 always has a pool, T3 almost always, T2 half of the units (alternating
 *    by code so neighbouring plots differ), T1 never.
 *  - The pool is centred in the rear garden and only assigned when that garden
 *    is deep enough to hold the water plus its deck.
 */
export function poolFor(code: string, typology: Typology, rearDepth: number = PLOT.rearDepth): PoolSpec | null {
  const plan = getFloorPlan(typology);
  const hash = codeHash(code);
  const allowed =
    typology === "T4" ? true : typology === "T3" ? hash % 7 !== 0 : typology === "T2" ? hash % 2 === 0 : false;
  if (!allowed) return null;

  const width = typology === "T4" ? 6.4 : typology === "T3" ? 5.4 : 4.6;
  const depth = typology === "T4" ? 3.0 : 2.6;
  // Spend whatever the garden affords on the sun deck (0.5 m up to 1.3 m); the
  // water keeps a constant gap from the façade and the rear wall.
  const deck = round(Math.min(1.3, Math.max(0.5, (rearDepth - depth - 0.7) / 2)), 2);
  if (rearDepth < depth + deck * 2 + 0.5) return null;
  const maxWidth = plan.widthM - (PLOT.sideMargin + deck) * 2 - 0.4;
  const fittedWidth = Math.min(width, Math.max(2.4, maxWidth));
  const fittedDepth = depth;
  const rearEdge = plan.depthM / 2;
  return {
    width: round(fittedWidth, 2),
    depth: round(fittedDepth, 2),
    x: round(hash % 2 === 0 ? -0.5 : 0.5, 2),
    z: round(-(rearEdge + 0.7 + deck + fittedDepth / 2), 2),
    deck,
  };
}

/** Rotate and translate a pool's local placement into world space. */
export function poolWorld(pool: PoolSpec, position: Vec2, rotationY: number): PoolWorld {
  const rad = (rotationY * Math.PI) / 180;
  return {
    x: round(position.x + pool.x * Math.cos(rad) + pool.z * Math.sin(rad), 2),
    z: round(position.z - pool.x * Math.sin(rad) + pool.z * Math.cos(rad), 2),
    width: pool.width,
    depth: pool.depth,
    rotationY,
  };
}

/** Keep-out circle used when scattering greenery over a pool plot. */
export function poolKeepOut(pool: PoolSpec, position: Vec2, rotationY: number) {
  const world = poolWorld(pool, position, rotationY);
  return { x: world.x, z: world.z, radius: Math.max(world.width, world.depth) / 2 + 1.4 };
}

export interface PlotWallSegment {
  /** Local coordinates relative to the house origin. */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

/**
 * Low boundary walls around a private plot: two side walls, a rear wall and two
 * short returns towards the street. Local space matches the house (front = +Z).
 */
export function plotWallsFor(typology: Typology, rearDepth: number = PLOT.rearDepth): PlotWallSegment[] {
  const plan = getFloorPlan(typology);
  const offsetX = plan.widthM / 2 + PLOT.sideMargin;
  const rear = plan.depthM / 2 + rearDepth;
  const front = plan.depthM / 2 + 0.6;
  const length = rear + front;
  const midZ = (-rear + front) / 2;
  return [
    { x: -offsetX, z: midZ, width: PLOT.wallThickness, depth: length, height: PLOT.wallHeight },
    { x: offsetX, z: midZ, width: PLOT.wallThickness, depth: length, height: PLOT.wallHeight },
    { x: 0, z: -rear, width: offsetX * 2, depth: PLOT.wallThickness, height: PLOT.wallHeight },
  ];
}
