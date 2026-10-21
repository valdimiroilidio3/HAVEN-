import { getFloorPlan } from "@/lib/domain/floorplans";
import type { Typology } from "@/lib/domain/types";
import { SITE_BOUNDS } from "@/lib/domain/validation";

/**
 * Condominium masterplan (metres). Shared by the exterior scene, the
 * driveway/plot generators, tree scattering and the scene editor grid.
 *
 * The plan is a deliberate composition, not a scatter:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │                 NORTH ROW  H01–H04                       │
 *   │  SPORTS PARK  ┌────────────────────────────┐   EAST ROW  │
 *   │  football     │      circuit road          │   H05–H08  │
 *   │  basketball   │   ┌────────────────────┐   │            │
 *   │  futsal       │   │  lagoon + gardens  │   │            │
 *   │  clubhouse    │   └────────────────────┘   │            │
 *   │               └────────────────────────────┘            │
 *   │            boulevard      SOUTH ROW  H09–H13             │
 *   │            ▼ gate                                        │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Every house fronts the same circuit at a constant 7.5 m setback, plots sit
 * on a constant 5 m rhythm, and vegetation is only placed inside declared
 * planting beds, so nothing overlaps a house, a pool or a carport.
 */
export const SITE = {
  width: 174,
  depth: 146,
  center: { x: -13, z: 7 },
  /** Perimeter fence. Private plots and planting beds are clipped to this. */
  fence: SITE_BOUNDS,
  /** Circuit road: rounded rectangle ring with a 6.5 m carriageway. */
  ring: {
    outer: { minX: -40, maxX: 40, minZ: -34, maxZ: 44, radius: 12 },
    inner: { minX: -33.5, maxX: 33.5, minZ: -27.5, maxZ: 37.5, radius: 5.5 },
    width: 6.5,
  },
  /** Straight approach from the gate to the circuit. */
  boulevard: { minX: -3.75, maxX: 3.75, minZ: 44, maxZ: 80 },
  /** Service road from the circuit into the sports park. */
  /** Service road linking the circuit to the sports park. */
  serviceRoad: { minX: -66, maxX: -40, minZ: 10, maxZ: 18 },
  gate: { x: 0, z: 80 },
  /** Condominium lagoon: the centrepiece of the central garden. */
  lagoon: { x: 0, z: 4, radiusX: 16, radiusZ: 10.2, deck: 5 },
  /** Open-air pavilion on the lagoon deck. */
  pavilion: { x: 0, z: -13.6, width: 11, depth: 5.5 },
  /** Sports park, west of the circuit. Courts are fenced 5-a-side/3x3 pitches. */
  sportsPark: { minX: -92, maxX: -64, minZ: -58, maxZ: 68 },
} as const;

export type Vec2 = { x: number; z: number };
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

export function pointInRect(x: number, z: number, rect: Rect): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

/**
 * Signed distance to a rounded rectangle (negative inside). Using the exact
 * silhouette keeps collision tests and the drawn mesh in agreement — the old
 * axis-aligned approximation disagreed with the rounded road by up to 3 m at
 * the corners.
 */
export function sdRoundedRect(x: number, z: number, rect: Rect & { radius: number }): number {
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const hw = (rect.maxX - rect.minX) / 2 - rect.radius;
  const hd = (rect.maxZ - rect.minZ) / 2 - rect.radius;
  const qx = Math.abs(x - cx) - hw;
  const qz = Math.abs(z - cz) - hd;
  const ax = Math.max(qx, 0);
  const az = Math.max(qz, 0);
  return Math.hypot(ax, az) + Math.min(Math.max(qx, qz), 0) - rect.radius;
}

export function pointInRingRoad(x: number, z: number, margin = 0): boolean {
  return (
    sdRoundedRect(x, z, SITE.ring.outer) <= margin &&
    sdRoundedRect(x, z, SITE.ring.inner) >= -margin
  );
}

/** True when a point falls on any carriageway (circuit, boulevard, service road). */
export function pointOnRoad(x: number, z: number, margin = 0): boolean {
  return (
    pointInRingRoad(x, z, margin) ||
    pointInRect(x, z, expand(SITE.boulevard, margin)) ||
    pointInRect(x, z, expand(SITE.serviceRoad, margin))
  );
}

function expand(rect: Rect, margin: number): Rect {
  return { minX: rect.minX - margin, maxX: rect.maxX + margin, minZ: rect.minZ - margin, maxZ: rect.maxZ + margin };
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

export function houseBounds(position: Vec2, typology: Typology, rotationDeg: number, margin = 0): Rect {
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

/** Unit vector along the façade (to the house's right when facing forward). */
function rightVector(rotationDeg: number): Vec2 {
  const rad = (rotationDeg * Math.PI) / 180;
  return { x: Math.cos(rad), z: -Math.sin(rad) };
}

export interface Driveway {
  x: number;
  z: number;
  length: number;
  width: number;
  rotationY: number;
}

/**
 * Compute a driveway from the house façade to the nearest carriageway.
 * `lateral` shifts the run sideways so it lines up with the parking bay.
 * Returns null when no road is reachable (a plot placed off-network).
 */
export function drivewayFor(position: Vec2, typology: Typology, rotationDeg: number, lateral = 0): Driveway | null {
  const plan = getFloorPlan(typology);
  const rad = (rotationDeg * Math.PI) / 180;
  const dir = facingVector(rotationDeg);
  const side = rightVector(rotationDeg);
  const facade = (plan.depthM / 2) * Math.abs(Math.cos(rad)) + (plan.widthM / 2) * Math.abs(Math.sin(rad));
  const startX = position.x + side.x * lateral + dir.x * facade;
  const startZ = position.z + side.z * lateral + dir.z * facade;
  let reached: number | null = null;
  for (let t = 0; t <= 30; t += 0.25) {
    if (pointOnRoad(startX + dir.x * t, startZ + dir.z * t, 0.2)) {
      reached = t;
      break;
    }
  }
  if (reached === null) return null;
  const length = Math.max(reached, 0.4) + 0.4;
  return {
    x: startX + dir.x * (length / 2 - 0.2),
    z: startZ + dir.z * (length / 2 - 0.2),
    length,
    width: 3.4,
    rotationY: rotationDeg,
  };
}

/**
 * Clear distance in front of the façade, i.e. the depth available between the
 * house and the carriageway. Cars park here, so it drives the garage size.
 */
export function frontGap(position: Vec2, rotationY: number, typology: Typology, lateral = 0): number {
  const plan = getFloorPlan(typology);
  const rad = (rotationY * Math.PI) / 180;
  const dir = facingVector(rotationY);
  const side = rightVector(rotationY);
  const facade = (plan.depthM / 2) * Math.abs(Math.cos(rad)) + (plan.widthM / 2) * Math.abs(Math.sin(rad));
  const startX = position.x + side.x * lateral;
  const startZ = position.z + side.z * lateral;
  for (let t = 0; t <= 40; t += 0.2) {
    if (pointOnRoad(startX + dir.x * (facade + t), startZ + dir.z * (facade + t), 0.2)) return round(t, 2);
  }
  return 0;
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
  /** Larger homes get walled sides and a lintel; smaller ones a light carport. */
  walled: boolean;
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

/**
 * A garage sized to the space actually available in front of the house — a
 * double carport for T3/T4, a single one for T1/T2. Returns null when the plot
 * has no room for a car, so nothing ever protrudes into the road.
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

/**
 * Choose the side of the entrance for the parking bay: both sides of the house
 * are tried and the deeper bay wins. Corner plots only reach a road on one
 * side, so the choice is not cosmetic.
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

/**
 * Planting beds. Nothing is scattered anywhere else on the site, which is what
 * keeps vegetation out of the plots, the carports and the pools.
 */
export const PLANTING_BEDS: Array<Rect & { mix: TreeKind[] }> = [
  // West meadow between the sports park and the circuit, north of the park
  // house (which owns the stretch between the service road and the south row).
  { minX: -62.5, maxX: -41.5, minZ: -58, maxZ: 7, mix: ["olive", "olive", "conifer", "broadleaf"] },
  { minX: -62.5, maxX: -41.5, minZ: 52, maxZ: 64, mix: ["olive", "broadleaf"] },
  // Inside the circuit, north of the lagoon.
  { minX: -31, maxX: 31, minZ: -26, maxZ: -18.5, mix: ["broadleaf", "poplar", "olive"] },
  // Inside the circuit, south of the lagoon.
  { minX: -31, maxX: 31, minZ: 20, maxZ: 36, mix: ["broadleaf", "olive", "poplar"] },
  // Inside the circuit, flanking the lagoon.
  { minX: -32.5, maxX: -23, minZ: -10, maxZ: 18, mix: ["olive", "broadleaf"] },
  { minX: 23, maxX: 32.5, minZ: -10, maxZ: 18, mix: ["olive", "broadleaf"] },
  // Boulevard verges.
  { minX: -9.5, maxX: -5.5, minZ: 46, maxZ: 76, mix: ["poplar", "poplar", "broadleaf"] },
  { minX: 5.5, maxX: 9.5, minZ: 46, maxZ: 76, mix: ["poplar", "poplar", "broadleaf"] },
  // Corner groves outside the housing rows.
  { minX: 42, maxX: 70, minZ: -62, maxZ: -38, mix: ["broadleaf", "conifer", "olive"] },
  { minX: 44, maxX: 70, minZ: 44, maxZ: 76, mix: ["broadleaf", "poplar", "olive"] },
  { minX: -98, maxX: -66, minZ: 66, maxZ: 76, mix: ["olive", "broadleaf"] },
  // Parking apron planting west of the sports clubhouse.
  { minX: -98, maxX: -94, minZ: -58, maxZ: 60, mix: ["conifer", "poplar"] },
];

/** Beds that read as flower borders rather than woodland. */
const FLOWER_BEDS: Rect[] = [
  // Boulevard verges, between the kerb and the poplar avenue.
  { minX: -5.4, maxX: -4, minZ: 46, maxZ: 78 },
  { minX: 4, maxX: 5.4, minZ: 46, maxZ: 78 },
  // Inside the circuit, hugging the kerb of the central garden.
  { minX: -31.5, maxX: 31.5, minZ: 35, maxZ: 37.2 },
  { minX: -33.2, maxX: -31.2, minZ: -26.5, maxZ: 35 },
  { minX: 31.2, maxX: 33.2, minZ: -26.5, maxZ: 35 },
  { minX: -31.5, maxX: 31.5, minZ: -27.2, maxZ: -25 },
];

export interface ScatterInput {
  houses: Array<{ position: Vec2; typology: Typology; rotationY: number }>;
  count?: number;
  seed?: number;
  /** Restrict to a region (e.g. the inner garden). */
  region?: Rect;
  /** Circular keep-out areas in world space (pools, patios, play areas). */
  keepOut?: Array<{ x: number; z: number; radius: number }>;
}

const HOUSE_CLEARANCE = 5.4;
const TREE_SPACING = 4.2;

export function scatterTrees({ houses, count = 96, seed = 20261021, region, keepOut = [] }: ScatterInput): TreeInstance[] {
  const rand = mulberry32(seed);
  const houseBoxes = houses.map((h) => houseBounds(h.position, h.typology, h.rotationY, HOUSE_CLEARANCE));
  const beds = region ? [{ ...region, mix: ["broadleaf", "olive", "poplar", "conifer"] as TreeKind[] }] : PLANTING_BEDS;
  const trees: TreeInstance[] = [];
  let attempts = 0;
  const maxAttempts = count * 60;

  while (trees.length < count && attempts < maxAttempts) {
    attempts += 1;
    const bed = beds[Math.floor(rand() * beds.length)]!;
    const x = bed.minX + rand() * (bed.maxX - bed.minX);
    const z = bed.minZ + rand() * (bed.maxZ - bed.minZ);
    // Trees keep 2.4 m from the kerb so canopies never overhang the road.
    if (pointOnRoad(x, z, 2.4)) continue;
    if (houseBoxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) continue;
    if (keepOut.some((zone) => Math.hypot(zone.x - x, zone.z - z) < zone.radius)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < TREE_SPACING)) continue;
    const kind = bed.mix[Math.floor(rand() * bed.mix.length)] ?? "broadleaf";
    trees.push({
      x: round(x),
      z: round(z),
      scale: round(0.78 + rand() * 0.8),
      rotation: round(rand() * Math.PI * 2, 3),
      variant: Math.floor(rand() * 3) as 0 | 1 | 2,
      kind,
    });
  }
  return trees;
}

export function scatterShrubs(houses: ScatterInput["houses"], seed = 7717): TreeInstance[] {
  const rand = mulberry32(seed);
  const beds = PLANTING_BEDS.slice(0, 10);
  const shrubs: TreeInstance[] = [];
  for (let i = 0; i < 260 && shrubs.length < 64; i++) {
    const bed = beds[Math.floor(rand() * beds.length)]!;
    const x = bed.minX + rand() * (bed.maxX - bed.minX);
    const z = bed.minZ + rand() * (bed.maxZ - bed.minZ);
    if (pointOnRoad(x, z, 1.6)) continue;
    if (houses.some((h) => pointInRect(x, z, houseBounds(h.position, h.typology, h.rotationY, 2.6)))) continue;
    if (shrubs.some((s) => Math.hypot(s.x - x, s.z - z) < 3)) continue;
    shrubs.push({
      x: round(x),
      z: round(z),
      scale: round(0.42 + rand() * 0.42, 2),
      rotation: round(rand() * Math.PI * 2, 3),
      variant: Math.floor(rand() * 3) as 0 | 1 | 2,
      kind: "broadleaf",
    });
  }
  return shrubs;
}

export interface FlowerInstance {
  x: number;
  z: number;
  scale: number;
  tone: 0 | 1 | 2;
}

export function scatterFlowers(seed = 4242): FlowerInstance[] {
  const rand = mulberry32(seed);
  const flowers: FlowerInstance[] = [];
  for (const bed of FLOWER_BEDS) {
    const area = (bed.maxX - bed.minX) * (bed.maxZ - bed.minZ);
    const count = Math.max(8, Math.round(area * 0.55));
    for (let i = 0; i < count; i++) {
      const x = bed.minX + rand() * (bed.maxX - bed.minX);
      const z = bed.minZ + rand() * (bed.maxZ - bed.minZ);
      if (pointOnRoad(x, z, 0.4)) continue;
      flowers.push({ x: round(x), z: round(z), scale: round(0.5 + rand() * 0.5, 2), tone: Math.floor(rand() * 3) as 0 | 1 | 2 });
    }
  }
  return flowers;
}

function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/** Street lamp positions: circuit, boulevard and sports park. */
export function lampPositions(): Vec2[] {
  const positions: Vec2[] = [];
  const zNorth = SITE.ring.outer.minZ - 2.6;
  const zSouth = SITE.ring.outer.maxZ + 2.6;
  const xWest = SITE.ring.outer.minX - 2.6;
  const xEast = SITE.ring.outer.maxX + 2.6;
  for (let x = -30; x <= 30; x += 15) {
    positions.push({ x, z: zNorth });
    positions.push({ x, z: zSouth });
  }
  for (let z = -22; z <= 32; z += 13.5) {
    positions.push({ x: xWest, z });
    positions.push({ x: xEast, z });
  }
  for (let z = 48; z <= 78; z += 10) {
    positions.push({ x: -6.4, z });
    positions.push({ x: 6.4, z });
  }
  return positions;
}

/* ── Sports park (west) ───────────────────────────────────────────────── */

export type CourtKind = "football" | "basketball" | "futsal";

export interface Court {
  kind: CourtKind;
  name: string;
  /** Playable surface centre and size. */
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Fenced run-off around the surface. */
  runOff: number;
  surface: "grass" | "court";
}

/** Three pitches, stacked north to south along the west side. */
export const COURTS: Court[] = [
  { kind: "football", name: "Football pitch", x: -78, z: -34, width: 24, depth: 34, runOff: 2.4, surface: "grass" },
  { kind: "basketball", name: "Basketball court", x: -78, z: 2, width: 15, depth: 27, runOff: 2, surface: "court" },
  { kind: "futsal", name: "Futsal court", x: -78, z: 33.5, width: 15, depth: 26, runOff: 2, surface: "court" },
];

export const CLUBHOUSE = { x: -78, z: 56.5, width: 16, depth: 10 } as const;

/** Full fence footprint of a court (surface + run-off). */
export function courtBounds(court: Court): Rect {
  return {
    minX: court.x - court.width / 2 - court.runOff,
    maxX: court.x + court.width / 2 + court.runOff,
    minZ: court.z - court.depth / 2 - court.runOff,
    maxZ: court.z + court.depth / 2 + court.runOff,
  };
}

/** Keep-out circles for vegetation around the pitches and clubhouse. */
export function sportsKeepOut(): Array<{ x: number; z: number; radius: number }> {
  return [
    ...COURTS.map((court) => ({
      x: court.x,
      z: court.z,
      radius: Math.max(court.width, court.depth) / 2 + court.runOff + 2.5,
    })),
    { x: CLUBHOUSE.x, z: CLUBHOUSE.z, radius: 12 },
  ];
}

/* ── Private plots: boundaries and swimming pools ─────────────────────── */

/** Depth of the private rear garden, measured from the façade. */
export const PLOT = {
  /** Distance from the house footprint edge to the side boundary wall. */
  sideMargin: 1.7,
  /** Distance from the rear façade to the rear boundary wall. */
  rearDepth: 11,
  wallHeight: 1.35,
  wallThickness: 0.3,
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
export const GARDEN_BOUNDS = { minX: -99.4, maxX: 73.4, minZ: -65.4, maxZ: 79.4 } as const;

/**
 * How far a house can extend its rear garden before reaching the perimeter.
 * Clamped so no wall, pool or hedge ever pokes through the fence.
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
  const available = limit - plan.depthM / 2 - 0.8;
  return round(Math.max(2.4, Math.min(PLOT.rearDepth, available)), 2);
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

  const width = typology === "T4" ? 7.2 : typology === "T3" ? 6.2 : 5.2;
  const depth = typology === "T4" ? 3.4 : typology === "T3" ? 3.0 : 2.8;
  // Spend whatever the garden affords on the sun deck (0.6 m up to 1.6 m); the
  // water keeps a constant gap from the façade and the rear wall.
  const deck = round(Math.min(1.6, Math.max(0.6, (rearDepth - depth - 0.9) / 2)), 2);
  if (rearDepth < depth + deck * 2 + 0.6) return null;
  // The deck is the pool's outer envelope, so it may use the side margin too.
  const maxWidth = plan.widthM + PLOT.sideMargin * 2 - deck * 2 - 0.4;
  const fittedWidth = Math.min(width, Math.max(2.6, maxWidth));
  const rearEdge = plan.depthM / 2;
  return {
    width: round(fittedWidth, 2),
    depth: round(depth, 2),
    x: round(hash % 2 === 0 ? -0.4 : 0.4, 2),
    z: round(-(rearEdge + 0.8 + deck + depth / 2), 2),
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
  return { x: world.x, z: world.z, radius: Math.max(world.width, world.depth) / 2 + 1.8 };
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
 * Low boundary walls around a private plot: two side walls and a rear wall.
 * Local space matches the house (front = +Z). The side walls run from the
 * street return to the rear corner, so neighbouring plots never share edges.
 */
export function plotWallsFor(typology: Typology, rearDepth: number = PLOT.rearDepth): PlotWallSegment[] {
  const plan = getFloorPlan(typology);
  const offsetX = plan.widthM / 2 + PLOT.sideMargin;
  const rear = plan.depthM / 2 + rearDepth;
  const front = plan.depthM / 2 + PLOT.frontReturn;
  const length = rear + front;
  const midZ = (-rear + front) / 2;
  return [
    { x: -offsetX, z: midZ, width: PLOT.wallThickness, depth: length, height: PLOT.wallHeight },
    { x: offsetX, z: midZ, width: PLOT.wallThickness, depth: length, height: PLOT.wallHeight },
    { x: 0, z: -rear, width: offsetX * 2 + PLOT.wallThickness, depth: PLOT.wallThickness, height: PLOT.wallHeight },
  ];
}
