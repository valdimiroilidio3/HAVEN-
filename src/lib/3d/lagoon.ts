import { SITE } from "./site";
import type { Part } from "./parts";

/**
 * The condominium lagoon, described as data.
 *
 * Same contract as `parts.ts`: the renderer merges these descriptors per
 * material, and the validator derives bounds from them. That matters more here
 * than anywhere else on the site, because almost everything around the water is
 * placed on an ellipse — a lounger that is on the deck at one angle is off it at
 * another, and "it looked fine" is exactly the reasoning this file replaces.
 *
 * Local coordinates are relative to the lagoon centre (`SITE.lagoon`), so the
 * deck can be drawn as an ellipse at the origin and everything else positioned
 * by angle and radius factor around it.
 */

const { radiusX: RX, radiusZ: RZ, deck: DECK } = SITE.lagoon;

/**
 * Ring geometry.
 *
 * The deck is drawn as an ellipse whose semi-axes are the water radii *plus* the
 * deck width — `(rx + deck, rz + deck)` — so a point on it is **not** the water
 * ellipse scaled by one factor: scaling both radii by the same number gives a
 * different (narrower) curve, and furniture placed that way drifts off the
 * paving at the ends of the ellipse. `t` here is the distance travelled across
 * the deck: 0 = water edge, 1 = outer edge.
 */
export function onDeckRing(angleDeg: number, t: number): { x: number; z: number } {
  const a = (angleDeg * Math.PI) / 180;
  // `t` is deliberately not clamped: negative walks into the basin (reeds, lilies)
  // and values above 1 are useful for testing the deck edge.
  const bulge = DECK * t;
  return { x: Math.cos(a) * (RX + bulge), z: Math.sin(a) * (RZ + bulge) };
}

/** True when a point lies inside the paved deck outline. */
export function insideDeckEllipse(x: number, z: number): boolean {
  const dx = (x - SITE.lagoon.x) / (RX + DECK);
  const dz = (z - SITE.lagoon.z) / (RZ + DECK);
  return dx * dx + dz * dz <= 1;
}

/** Shortest angular distance between two bearings, in degrees (0–180). */
export function angleDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** Rotation about Y that aligns a box's local X axis with the ellipse tangent. */
export function ringRotation(angleDeg: number): number {
  const a = (angleDeg * Math.PI) / 180;
  const tx = -RX * Math.sin(a);
  const tz = RZ * Math.cos(a);
  return Math.atan2(-tz, tx);
}

/** True when a world-space point is inside the water ellipse (factor 1 by default). */
export function inLagoonWater(x: number, z: number, factor = 1): boolean {
  const dx = (x - SITE.lagoon.x) / (RX * factor);
  const dz = (z - SITE.lagoon.z) / (RZ * factor);
  return dx * dx + dz * dz <= 1;
}

/** True when a world-space point is on the deck: outside the water, inside the paving. */
export function onLagoonDeck(x: number, z: number, innerFactor = 1.02): boolean {
  return !inLagoonWater(x, z, innerFactor) && insideDeckEllipse(x, z);
}

export interface LagoonPartsInput {
  lowQuality?: boolean;
}

/* ── Deck furniture ───────────────────────────────────────────────────── */

function lounger(id: string, x: number, z: number, rotationY: number): Part[] {
  // Local frame: X across the seat, Z along the body (head at −Z).
  const seatY = 0.34;
  return [
    {
      id: `${id}/frame`,
      group: "furniture",
      material: "timber",
      shape: { kind: "box", size: [0.66, 0.09, 1.92], position: [x, seatY, z], rotation: [0, rotationY, 0] },
    },
    {
      id: `${id}/cushion`,
      group: "furniture",
      material: "white",
      shape: { kind: "box", size: [0.58, 0.11, 1.5], position: [x, seatY + 0.1, z], rotation: [0, rotationY, 0] },
    },
    {
      id: `${id}/back`,
      group: "furniture",
      material: "white",
      shape: {
        kind: "box",
        size: [0.58, 0.1, 0.78],
        position: [x, seatY + 0.26, z],
        rotation: [-0.66, rotationY, 0],
        scale: [1, 1, 1],
      },
    },
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map((end) => ({
        id: `${id}/leg-${side}-${end}`,
        group: "furniture" as const,
        material: "timberDark" as const,
        shape: {
          kind: "box" as const,
          size: [0.07, 0.3, 0.07],
          position: [x + Math.cos(rotationY) * side * 0.26, 0.15, z - Math.sin(rotationY) * side * 0.26 + end * 0.78] as [number, number, number],
        },
      })),
    ),
  ];
}

function parasol(id: string, x: number, z: number): Part[] {
  return [
    {
      id: `${id}/pole`,
      group: "furniture",
      material: "timber",
      shape: { kind: "cylinder", size: [0.045, 0.055, 2.3], position: [x, 1.15, z] },
    },
    {
      id: `${id}/canopy`,
      group: "furniture",
      material: "white",
      shape: { kind: "cylinder", size: [1.34, 1.34, 0.08], position: [x, 2.32, z] },
    },
    {
      id: `${id}/finial`,
      group: "furniture",
      material: "timber",
      shape: { kind: "cylinder", size: [0.03, 0.03, 0.16], position: [x, 2.44, z] },
    },
    {
      id: `${id}/base`,
      group: "furniture",
      material: "stone",
      shape: { kind: "cylinder", size: [0.34, 0.38, 0.12], position: [x, 0.14, z] },
    },
  ];
}

function sideTable(id: string, x: number, z: number): Part[] {
  return [
    {
      id: `${id}/top`,
      group: "furniture",
      material: "timber",
      shape: { kind: "cylinder", size: [0.28, 0.28, 0.06], position: [x, 0.44, z] },
    },
    {
      id: `${id}/stem`,
      group: "furniture",
      material: "metal",
      shape: { kind: "cylinder", size: [0.03, 0.03, 0.44], position: [x, 0.22, z] },
    },
    {
      id: `${id}/foot`,
      group: "furniture",
      material: "metal",
      shape: { kind: "cylinder", size: [0.16, 0.16, 0.03], position: [x, 0.02, z] },
    },
  ];
}

/* ── Deck detail ──────────────────────────────────────────────────────── */

/** Stone coping: a ring of short segments hugging the water, slightly raised. */
function coping(segments: number): Part[] {
  const parts: Part[] = [];
  const t = 0.34 / DECK; // a 0.34 m lip outside the water
  for (let i = 0; i < segments; i += 1) {
    const angle = (360 / segments) * (i + 0.5);
    const point = onDeckRing(angle, t);
    const arc = (Math.PI * 2 * ((RX + DECK * t + RZ + DECK * t) / 2)) / segments;
    parts.push({
      id: `lagoon/coping/${i}`,
      group: "deck",
      material: "stone",
      shape: {
        kind: "box",
        size: [arc * 1.08, 0.16, 0.62],
        position: [point.x, 0.14, point.z],
        rotation: [0, ringRotation(angle), 0],
      },
    });
  }
  return parts;
}

/** Timber boardwalk across the east side of the deck, planks running radially. */
function boardwalk(segments: number, fromDeg: number, toDeg: number): Part[] {
  const parts: Part[] = [];
  const inner = 0.62 / DECK;
  // The planks are straight while the ring curves, so the outer edge stops short
  // of the paving edge: a 0.9 m margin keeps every corner on the deck.
  const outer = (DECK - 1.4) / DECK;
  const mid = (inner + outer) / 2;
  const depth = outer * DECK - inner * DECK;
  for (let i = 0; i < segments; i += 1) {
    const angle = fromDeg + ((toDeg - fromDeg) / segments) * (i + 0.5);
    const point = onDeckRing(angle, mid);
    const arc = (Math.abs(((toDeg - fromDeg) * Math.PI) / 180) * (RX + DECK * mid)) / segments;
    parts.push({
      id: `lagoon/boardwalk/${i}`,
      group: "deck",
      material: "deck",
      shape: {
        kind: "box",
        size: [Math.max(0.16, arc * 0.88), 0.07, depth],
        position: [point.x, 0.11, point.z],
        rotation: [0, ringRotation(angle), 0],
      },
    });
  }
  return parts;
}

/** Four wide steps into the water on the south side, with a handrail each side. */
function steps(): Part[] {
  const parts: Part[] = [];
  const z0 = RZ + 0.1;
  for (let i = 0; i < 4; i += 1) {
    parts.push({
      id: `lagoon/steps/${i}`,
      group: "deck",
      material: "stone",
      shape: { kind: "box", size: [4.6 - i * 0.18, 0.14, 0.42], position: [0, 0.05 - i * 0.14, z0 - i * 0.34] },
    });
  }
  for (const side of [-1, 1]) {
    parts.push({
      id: `lagoon/steps/rail-${side}`,
      group: "furniture",
      material: "metal",
      shape: { kind: "cylinder", size: [0.035, 0.035, 1.05], position: [side * 2.35, 0.52, z0 + 0.1] },
    });
    parts.push({
      id: `lagoon/steps/rail-top-${side}`,
      group: "furniture",
      material: "metal",
      shape: { kind: "box", size: [0.06, 0.06, 1.1], position: [side * 2.35, 1.05, z0 - 0.35] },
    });
  }
  return parts;
}

/** Warm bollards along the outer edge, spaced so the pavilion stays open. */
function bollards(count: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (360 / count) * i;
    // Keep the pavilion front (north, 270°) and the steps (south, 90°) clear.
    if (angleDistance(angle, 270) < 55) continue;
    if (angleDistance(angle, 90) < 26) continue;
    const point = onDeckRing(angle, 0.94);
    parts.push({
      id: `lagoon/bollard/${i}/post`,
      group: "light",
      material: "metal",
      shape: { kind: "cylinder", size: [0.055, 0.075, 0.9], position: [point.x, 0.45, point.z] },
    });
    parts.push({
      id: `lagoon/bollard/${i}/head`,
      group: "light",
      material: "lamp",
      shape: { kind: "box", size: [0.16, 0.14, 0.16], position: [point.x, 0.95, point.z] },
    });
  }
  return parts;
}

/* ── Planting and water features ──────────────────────────────────────── */

function reeds(lowQuality: boolean): Part[] {
  const parts: Part[] = [];
  const clusters = lowQuality ? [140, 320] : [140, 175, 300, 335];
  clusters.forEach((angle, cluster) => {
    const origin = onDeckRing(angle, -0.09);
    const stems = lowQuality ? 5 : 9;
    for (let i = 0; i < stems; i += 1) {
      const spread = 0.55;
      const dx = Math.cos((i / stems) * Math.PI * 2) * spread * (0.4 + ((i * 7) % 5) / 8);
      const dz = Math.sin((i / stems) * Math.PI * 2) * spread * (0.4 + ((i * 3) % 5) / 8);
      const height = 0.75 + ((i * 5) % 7) * 0.09;
      // Reeds must stand in the water: drop any stem the spread pushes onto the coping.
      if (!inLagoonWater(origin.x + dx + SITE.lagoon.x, origin.z + dz + SITE.lagoon.z, 0.95)) continue;
      parts.push({
        id: `lagoon/reed/${cluster}-${i}`,
        group: "planting",
        material: "reed",
        shape: { kind: "cylinder", size: [0.018, 0.03, height], position: [origin.x + dx, height / 2 - 0.05, origin.z + dz] },
      });
    }
  });
  return parts;
}

function lilyPads(): Part[] {
  const parts: Part[] = [];
  // Inside the water: negative `t` walks into the basin.
  const pads = [
    [104, -0.1, 0.33],
    [110, -0.06, 0.27],
    [116, -0.12, 0.36],
    [122, -0.07, 0.29],
    [128, -0.1, 0.24],
    [134, -0.05, 0.31],
  ] as const;
  pads.forEach(([angle, t, size], index) => {
    const point = onDeckRing(angle, t);
    parts.push({
      id: `lagoon/lily/${index}`,
      group: "planting",
      material: "lily",
      shape: { kind: "cylinder", size: [size, size, 0.02], position: [point.x, 0.13, point.z] },
    });
  });
  return parts;
}

function rimRocks(): Part[] {
  const parts: Part[] = [];
  const rocks = [
    [-205, 0.1, 0.5],
    [-196, 0.04, 0.34],
    [-58, 0.08, 0.44],
    [-50, 0.03, 0.3],
  ] as const;
  rocks.forEach(([angle, t, size], index) => {
    const point = onDeckRing(angle, t);
    parts.push({
      id: `lagoon/rock/${index}`,
      group: "planting",
      material: "rock",
      shape: {
        kind: "icosahedron",
        size: [size],
        position: [point.x, size * 0.45, point.z],
        scale: [1.25, 0.72, 1],
        rotation: [0.3 * index, 0.8 * index, 0],
      },
    });
  });
  return parts;
}

function planters(): Part[] {
  const parts: Part[] = [];
  const spots = [
    [-6.4, -10.6],
    [6.4, -10.6],
  ] as const;
  spots.forEach(([x, z], index) => {
    parts.push({
      id: `lagoon/planter/${index}/box`,
      group: "planting",
      material: "concrete",
      shape: { kind: "box", size: [1.5, 0.55, 0.8], position: [x, 0.28, z] },
    });
    parts.push({
      id: `lagoon/planter/${index}/hedge`,
      group: "planting",
      material: "hedge",
      shape: { kind: "box", size: [1.3, 0.5, 0.62], position: [x, 0.75, z] },
    });
  });
  return parts;
}

/* ── Pavilion ─────────────────────────────────────────────────────────── */

/**
 * Open pavilion: a raised timber floor, four posts, a slatted roof and a bar.
 * Built from the same `SITE.pavilion` numbers the validator checks.
 */
function pavilion(lowQuality: boolean): Part[] {
  const { width: W, depth: D } = SITE.pavilion;
  // SITE.pavilion is in world coordinates; the deck group is local.
  const cz = SITE.pavilion.z - SITE.lagoon.z;
  const parts: Part[] = [];
  const slabY = 0.16;

  parts.push({
    id: "lagoon/pavilion/slab",
    group: "structure",
    material: "concrete",
    shape: { kind: "box", size: [W + 1.0, 0.32, D + 0.7], position: [0, slabY, cz] },
  });
  parts.push({
    id: "lagoon/pavilion/floor",
    group: "structure",
    material: "deck",
    shape: { kind: "box", size: [W + 0.4, 0.06, D + 0.3], position: [0, slabY + 0.18, cz] },
  });

  // Posts at the four corners, inside the slab.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({
        id: `lagoon/pavilion/post-${sx}-${sz}`,
        group: "structure",
        material: "timber",
        shape: { kind: "box", size: [0.18, 3.5, 0.18], position: [(sx * (W - 0.7)) / 2, 1.95, cz + (sz * (D - 0.5)) / 2] },
      });
    }
  }

  // Roof: perimeter beams plus rafters, so it reads as built rather than solid.
  parts.push({
    id: "lagoon/pavilion/beam-n",
    group: "structure",
    material: "timberDark",
    shape: { kind: "box", size: [W + 0.9, 0.2, 0.22], position: [0, 3.78, cz - (D + 0.6) / 2] },
  });
  parts.push({
    id: "lagoon/pavilion/beam-s",
    group: "structure",
    material: "timberDark",
    shape: { kind: "box", size: [W + 0.9, 0.2, 0.22], position: [0, 3.78, cz + (D + 0.6) / 2] },
  });
  const rafters = lowQuality ? 7 : 13;
  for (let i = 0; i < rafters; i += 1) {
    parts.push({
      id: `lagoon/pavilion/rafter/${i}`,
      group: "structure",
      material: "timber",
      shape: {
        kind: "box",
        size: [0.16, 0.12, D + 0.55],
        position: [-W / 2 + 0.5 + i * ((W - 1) / (rafters - 1)), 3.9, cz],
      },
    });
  }

  // Bar counter at the back, with three stools.
  parts.push({
    id: "lagoon/pavilion/bar",
    group: "structure",
    material: "concrete",
    shape: { kind: "box", size: [4.4, 1.0, 0.7], position: [-1.4, 0.72, cz - D / 2 + 0.55] },
  });
  parts.push({
    id: "lagoon/pavilion/bar-top",
    group: "structure",
    material: "timberDark",
    shape: { kind: "box", size: [4.7, 0.09, 0.9], position: [-1.4, 1.26, cz - D / 2 + 0.55] },
  });
  for (let i = 0; i < 3; i += 1) {
    parts.push({
      id: `lagoon/pavilion/stool/${i}`,
      group: "furniture",
      material: "timber",
      shape: { kind: "cylinder", size: [0.19, 0.19, 0.1], position: [-2.9 + i * 1.5, 0.66, cz - D / 2 + 1.35] },
    });
    parts.push({
      id: `lagoon/pavilion/stool-leg/${i}`,
      group: "furniture",
      material: "metal",
      shape: { kind: "cylinder", size: [0.05, 0.06, 0.62], position: [-2.9 + i * 1.5, 0.33, cz - D / 2 + 1.35] },
    });
  }

  // Bench along the east end, facing the water.
  parts.push({
    id: "lagoon/pavilion/bench",
    group: "furniture",
    material: "timber",
    shape: { kind: "box", size: [0.55, 0.12, 2.4], position: [W / 2 - 1.1, 0.55, cz + 0.1] },
  });

  // Lanterns under the roof, off in daylight (the renderer lights them at night).
  for (const sx of [-1, 1]) {
    parts.push({
      id: `lagoon/pavilion/lantern-${sx}`,
      group: "light",
      material: "lamp",
      shape: { kind: "cylinder", size: [0.11, 0.13, 0.26], position: [(sx * (W - 2.6)) / 2, 3.2, cz + 0.4] },
    });
  }

  return parts;
}

/* ── Public builder ───────────────────────────────────────────────────── */

export interface LagoonLayout {
  parts: Part[];
  /** Facets used for the deck/water ellipses, so the renderer matches the data. */
  segments: number;
  counts: { parts: number; furniture: number; planting: number; lights: number };
}

export function lagoonLayout({ lowQuality = false }: LagoonPartsInput = {}): LagoonLayout {
  const segments = lowQuality ? 40 : 96;
  const parts: Part[] = [
    ...coping(lowQuality ? 36 : 72),
    ...boardwalk(lowQuality ? 14 : 26, -52, 52),
    ...steps(),
    ...bollards(lowQuality ? 8 : 12),
    ...pavilion(lowQuality),
    ...planters(),
    ...reeds(lowQuality),
    ...(lowQuality ? [] : lilyPads()),
    ...rimRocks(),
  ];

  // Deck furniture: a row of loungers on the west deck, parasols between them.
  const loungerCount = lowQuality ? 3 : 6;
  for (let i = 0; i < loungerCount; i += 1) {
    const angle = 152 + i * 10;
    const seat = onDeckRing(angle, 0.28);
    // Face the water: the body axis points at the lagoon centre.
    const rotation = -(angle * Math.PI) / 180 + Math.PI / 2;
    parts.push(...lounger(`lagoon/lounger/${i}`, seat.x, seat.z, rotation));
    if (i % 2 === 0) {
      const table = onDeckRing(angle + 5, 0.3);
      parts.push(...sideTable(`lagoon/table/${i}`, table.x, table.z));
    }
  }
  const parasolAngles = lowQuality ? [168] : [157, 187];
  parasolAngles.forEach((angle, index) => {
    const spot = onDeckRing(angle, 0.45);
    parts.push(...parasol(`lagoon/parasol/${index}`, spot.x, spot.z));
  });

  return {
    parts,
    segments,
    counts: {
      parts: parts.length,
      furniture: parts.filter((part) => part.group === "furniture").length,
      planting: parts.filter((part) => part.group === "planting").length,
      lights: parts.filter((part) => part.group === "light").length,
    },
  };
}

/** Water surface definition, shared by the renderer and the validator. */
export const LAGOON_WATER = {
  radiusX: RX,
  radiusZ: RZ,
  y: 0.02,
  /** Basin floor, below the water. */
  floorY: -0.62,
} as const;
