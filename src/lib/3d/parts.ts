import type { GarageSpec, PoolSpec, Rect } from "./site";

/**
 * Plot geometry as data.
 *
 * Every wall, carport, car, pool and piece of pool furniture is described here
 * as a transform plus a primitive. Two consumers read the same descriptors:
 *
 *   1. `components/three/Plot.tsx` merges them per material and renders them
 *      (a plot becomes ~10 draw calls instead of ~70 meshes).
 *   2. `lib/3d/validate.ts` derives world-space bounds from them and checks the
 *      plot against roads, neighbours and the perimeter.
 *
 * Keeping the layout in one pure module is what stops the validator from
 * approving a layout that the renderer does not actually draw.
 */

export type PartMaterial =
  | "render"
  | "stone"
  | "concrete"
  | "timber"
  | "timberDark"
  | "charcoal"
  | "metal"
  | "white"
  | "deck"
  | "poolTile"
  | "water"
  | "glass"
  | "hedge"
  | "carPaint0"
  | "carPaint1"
  | "carPaint2"
  | "carGlass";

export type PartGroup = "boundary" | "carport" | "car" | "pool" | "deck" | "furniture";

export interface PartShape {
  kind: "box" | "cylinder" | "icosahedron" | "torus";
  /** box: [w,h,d] · cylinder: [rTop,rBottom,h] · icosahedron: [r] · torus: [r,tube] */
  size: number[];
  /** Centre of the primitive in plot-local space (metres, +Y up). */
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface Part {
  /** Stable identifier, unique across the site (e.g. "H05/pool/deck"). */
  id: string;
  group: PartGroup;
  material: PartMaterial;
  shape: PartShape;
}

export interface PartBounds extends Rect {
  minY: number;
  maxY: number;
}

const TAU = Math.PI * 2;

function shapeExtents(shape: PartShape): [number, number, number] {
  const s = shape.size;
  switch (shape.kind) {
    case "box":
      return [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0];
    case "cylinder":
      return [(s[0] ?? s[1] ?? 0) * 2, s[2] ?? 0, (s[0] ?? s[1] ?? 0) * 2];
    case "icosahedron":
      return [(s[0] ?? 0) * 2, (s[0] ?? 0) * 2, (s[0] ?? 0) * 2];
    case "torus":
      return [(s[0] ?? 0) * 2 + (s[1] ?? 0) * 2, (s[1] ?? 0) * 2, (s[0] ?? 0) * 2 + (s[1] ?? 0) * 2];
  }
}

/** World-space AABB of a part — rotation-aware, so wheel discs are not oversized. */
export function partBounds(part: Part, origin: { x: number; z: number }, rotationDeg: number): PartBounds {
  const [w, h, d] = shapeExtents(part.shape);
  const scale = part.shape.scale ?? [1, 1, 1];
  const half = [(w / 2) * scale[0]!, (h / 2) * scale[1]!, (d / 2) * scale[2]!] as const;
  const [rx, ry, rz] = part.shape.rotation ?? [0, 0, 0];

  // Rotate the eight corners by the part's own rotation (XYZ euler), then place.
  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        let x = half[0] * sx;
        let y = half[1] * sy;
        let z = half[2] * sz;
        // X
        let t = y * cosX - z * sinX;
        z = y * sinX + z * cosX;
        y = t;
        // Y
        t = x * cosY + z * sinY;
        z = -x * sinY + z * cosY;
        x = t;
        // Z
        t = x * cosZ - y * sinZ;
        y = x * sinZ + y * cosZ;
        x = t;
        const wx = x + part.shape.position[0];
        const wy = y + part.shape.position[1];
        const wz = z + part.shape.position[2];
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
      }
    }
  }

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let ox = 0, oz = 0;
  const outX: number[] = [];
  const outZ: number[] = [];
  for (const [cx, cz] of [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]] as const) {
    outX.push(cx * cos + cz * sin);
    outZ.push(-cx * sin + cz * cos);
  }
  ox = origin.x + Math.min(...outX);
  oz = origin.z + Math.min(...outZ);
  return {
    minX: ox,
    minZ: oz,
    maxX: origin.x + Math.max(...outX),
    maxZ: origin.z + Math.max(...outZ),
    minY,
    maxY,
  };
}

const PLOT_WALL_TOP = 0.09;

function wallParts(code: string, walls: Array<{ x: number; z: number; width: number; depth: number; height: number }>): Part[] {
  const names = ["left", "right", "rear"];
  return walls.flatMap((wall, index) => {
    const name = names[index] ?? `wall-${index}`;
    const parts: Part[] = [
      {
        id: `${code}/boundary/${name}`,
        group: "boundary",
        material: "render",
        shape: { kind: "box", size: [wall.width, wall.height, wall.depth], position: [wall.x, wall.height / 2, wall.z] },
      },
      {
        id: `${code}/boundary/${name}-coping`,
        group: "boundary",
        material: "stone",
        shape: {
          kind: "box",
          size: [wall.width + 0.14, PLOT_WALL_TOP, wall.depth + 0.14],
          position: [wall.x, wall.height + PLOT_WALL_TOP / 2, wall.z],
        },
      },
    ];
    if (index < 2) {
      parts.push({
        id: `${code}/boundary/${name}-pier`,
        group: "boundary",
        material: "stone",
        shape: {
          kind: "box",
          size: [wall.width + 0.3, wall.height + 0.3, 0.5],
          position: [wall.x, (wall.height + 0.3) / 2, wall.z + wall.depth / 2 - 0.25],
        },
      });
    }
    return parts;
  });
}

const CAR_SPEC = {
  length: 3.95,
  width: 1.76,
  bodyHeight: 0.36,
  bodyY: 0.46,
  cabinHeight: 0.44,
  cabinY: 1.02,
  wheelRadius: 0.33,
  wheelWidth: 0.22,
  bayOffset: 1.45,
};

function carParts(code: string, index: number, x: number, paint: PartMaterial): Part[] {
  const prefix = `${code}/car-${index}`;
  const s = CAR_SPEC;
  const parts: Part[] = [
    {
      id: `${prefix}/body`,
      group: "car",
      material: paint,
      shape: { kind: "box", size: [s.width, s.bodyHeight, s.length], position: [x, s.bodyY, 0] },
    },
    {
      id: `${prefix}/shoulder`,
      group: "car",
      material: paint,
      shape: { kind: "box", size: [s.width - 0.06, 0.34, s.length - 0.5], position: [x, 0.74, -0.06] },
    },
    {
      id: `${prefix}/cabin`,
      group: "car",
      material: "carGlass",
      shape: { kind: "box", size: [1.58, s.cabinHeight, 2.15], position: [x, s.cabinY, -0.2] },
    },
    {
      id: `${prefix}/roof`,
      group: "car",
      material: paint,
      shape: { kind: "box", size: [1.5, 0.1, 1.95], position: [x, 1.24, -0.2] },
    },
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map<Part>((end) => ({
        id: `${prefix}/wheel-${side}-${end}`,
        group: "car",
        material: "charcoal",
        shape: {
          kind: "cylinder",
          size: [s.wheelRadius, s.wheelRadius, s.wheelWidth],
          position: [x + side * 0.8, s.wheelRadius, end * 1.3],
          rotation: [0, 0, Math.PI / 2],
        },
      })),
    ),
    ...[-1, 1].map<Part>((side) => ({
      id: `${prefix}/headlight-${side}`,
      group: "car",
      material: "white",
      shape: { kind: "box", size: [0.46, 0.12, 0.06], position: [x + side * 0.56, 0.7, s.length / 2 + 0.02] },
    })),
  ];
  return parts;
}

function carportParts(code: string, spec: GarageSpec, seed: number, lowQuality: boolean): Part[] {
  const height = 3.05;
  const roof = spec.depth + 0.4;
  const slats = lowQuality ? 4 : 9;
  const parts: Part[] = [
    {
      id: `${code}/carport/apron`,
      group: "carport",
      material: "concrete",
      shape: { kind: "box", size: [spec.width + 0.8, 0.09, spec.depth + 0.4], position: [spec.x, 0.055, spec.z + 0.02] },
    },
    ...[-1, 1].map<Part>((side) => ({
      id: `${code}/carport/edge-${side}`,
      group: "carport",
      material: "timberDark",
      shape: {
        kind: "box",
        size: [spec.width + 0.9, 0.2, 0.2],
        position: [spec.x, height, spec.z + (side * (roof - 0.2)) / 2],
      },
    })),
    ...[-1, 1].map<Part>((side) => ({
      id: `${code}/carport/rail-${side}`,
      group: "carport",
      material: "timber",
      shape: {
        kind: "box",
        size: [0.14, 0.16, roof],
        position: [spec.x + (side * (spec.width + 0.9)) / 2, height + 0.02, spec.z],
      },
    })),
    ...Array.from({ length: slats }).map<Part>((_, index) => ({
      id: `${code}/carport/slat-${index}`,
      group: "carport",
      material: "timberDark",
      shape: {
        kind: "box",
        size: [spec.width + 0.9, 0.12, 0.14],
        position: [spec.x, height + 0.01, spec.z - roof / 2 + 0.45 + (index * (roof - 0.9)) / Math.max(1, slats - 1)],
      },
    })),
    ...[-1, 1].map<Part>((side) => ({
      id: `${code}/carport/post-${side}`,
      group: "carport",
      material: "timber",
      shape: {
        kind: "box",
        size: [0.17, height, 0.17],
        position: [spec.x + side * (spec.width / 2 - 0.16), height / 2, spec.z + spec.depth / 2 + 0.2],
      },
    })),
  ];

  if (spec.walled) {
    parts.push(
      ...[-1, 1].map<Part>((side) => ({
        id: `${code}/carport/wall-${side}`,
        group: "carport",
        material: "render",
        shape: {
          kind: "box",
          size: [0.18, 3.0, spec.depth - 0.1],
          position: [spec.x + side * (spec.width / 2), 1.5, spec.z - 0.1],
        },
      })),
      {
        id: `${code}/carport/lintel`,
        group: "carport",
        material: "charcoal",
        shape: {
          kind: "box",
          size: [spec.width - 0.6, 0.34, 0.15],
          position: [spec.x, height - 0.44, spec.z + spec.depth / 2 - 0.05],
        },
      },
    );
  } else {
    parts.push({
      id: `${code}/carport/side-panel`,
      group: "carport",
      material: "timber",
      shape: { kind: "box", size: [0.12, 2.9, spec.depth - 0.5], position: [spec.x + spec.width / 2, 1.45, spec.z] },
    });
  }

  const carScale = Math.min(1, (spec.depth - 0.35) / 4.2);
  const paints: PartMaterial[] = ["carPaint0", "carPaint1", "carPaint2"];
  const bayXs = spec.bays === 2 ? [-CAR_SPEC.bayOffset, CAR_SPEC.bayOffset] : [0];
  bayXs.forEach((offset, index) => {
    const paint = paints[(seed + index) % paints.length] ?? "carPaint0";
    parts.push(...carParts(code, index, spec.x + offset, paint).map((part) => ({
      ...part,
      shape: {
        ...part.shape,
        position: [part.shape.position[0], part.shape.position[1], spec.z + part.shape.position[2] * carScale] as [number, number, number],
        scale: [1, 1, carScale] as [number, number, number],
      },
    })));
  });

  return parts;
}

function poolParts(code: string, pool: PoolSpec): Part[] {
  const deckWidth = pool.width + pool.deck * 2;
  const deckDepth = pool.depth + pool.deck * 2;
  const coping = 0.34;
  const loungerX = pool.width / 2 + pool.deck * 0.55;
  const parts: Part[] = [
    {
      id: `${code}/pool/deck`,
      group: "deck",
      material: "deck",
      shape: { kind: "box", size: [deckWidth, 0.1, deckDepth], position: [pool.x, 0.05, pool.z] },
    },
    ...[
      { x: -(pool.width / 2 + coping / 2), z: 0, w: coping, d: pool.depth + coping * 2 },
      { x: pool.width / 2 + coping / 2, z: 0, w: coping, d: pool.depth + coping * 2 },
      { x: 0, z: -(pool.depth / 2 + coping / 2), w: pool.width, d: coping },
      { x: 0, z: pool.depth / 2 + coping / 2, w: pool.width, d: coping },
    ].map<Part>((rim, index) => ({
      id: `${code}/pool/coping-${index}`,
      group: "pool",
      material: "stone",
      shape: { kind: "box", size: [rim.w, 0.1, rim.d], position: [pool.x + rim.x, 0.11, pool.z + rim.z] },
    })),
    {
      id: `${code}/pool/basin`,
      group: "pool",
      material: "poolTile",
      shape: { kind: "box", size: [pool.width, 0.52, pool.depth], position: [pool.x, -0.2, pool.z] },
    },
    {
      id: `${code}/pool/water`,
      group: "pool",
      material: "water",
      shape: { kind: "box", size: [pool.width - 0.14, 0.12, pool.depth - 0.14], position: [pool.x, 0.08, pool.z] },
    },
    ...[0, 1, 2].map<Part>((step) => ({
      id: `${code}/pool/step-${step}`,
      group: "pool",
      material: "poolTile",
      shape: {
        kind: "box",
        size: [0.36, 0.08 + step * 0.12, 1.15],
        position: [
          pool.x - pool.width / 2 + 0.42 + step * 0.36,
          0.02 - step * 0.06,
          pool.z - pool.depth / 2 + 0.55,
        ],
      },
    })),
    ...[-0.18, 0.18].map<Part>((offset) => ({
      id: `${code}/pool/ladder-${offset}`,
      group: "pool",
      material: "metal",
      shape: {
        kind: "box",
        size: [0.05, 0.72, 0.05],
        position: [pool.x + pool.width / 2 - 0.5 + offset, 0.3, pool.z - pool.depth / 2 + 0.9],
      },
    })),
    {
      id: `${code}/pool/ladder-rail`,
      group: "pool",
      material: "metal",
      shape: {
        kind: "box",
        size: [0.46, 0.05, 0.05],
        position: [pool.x + pool.width / 2 - 0.5, 0.6, pool.z - pool.depth / 2 + 0.9],
      },
    },
  ];

  const lounger = (id: string, x: number, z: number): Part[] => [
    {
      id: `${id}/frame`,
      group: "furniture",
      material: "timber",
      shape: { kind: "box", size: [0.62, 0.1, 1.86], position: [x, 0.3, z] },
    },
    {
      id: `${id}/mattress`,
      group: "furniture",
      material: "white",
      shape: { kind: "box", size: [0.56, 0.1, 1.48], position: [x, 0.38, z + 0.08] },
    },
    {
      id: `${id}/back`,
      group: "furniture",
      material: "white",
      shape: { kind: "box", size: [0.56, 0.09, 0.72], position: [x, 0.5, z - 0.64], rotation: [-0.62, 0, 0] },
    },
  ];
  parts.push(...lounger(`${code}/pool/lounger-a`, pool.x + loungerX, pool.z + 0.95));
  parts.push(...lounger(`${code}/pool/lounger-b`, pool.x + loungerX, pool.z - 0.95));

  parts.push(
    {
      id: `${code}/pool/parasol-mast`,
      group: "furniture",
      material: "timber",
      shape: { kind: "cylinder", size: [0.05, 0.055, 2.3], position: [pool.x - (pool.width / 2 + pool.deck * 0.5), 1.15, pool.z] },
    },
    {
      id: `${code}/pool/parasol-canopy`,
      group: "furniture",
      material: "white",
      shape: { kind: "cylinder", size: [1.15, 1.15, 0.09], position: [pool.x - (pool.width / 2 + pool.deck * 0.5), 2.32, pool.z] },
    },
    ...[1, -1].map<Part>((end) => ({
      id: `${code}/pool/planter-${end}`,
      group: "furniture",
      material: "concrete",
      shape: {
        kind: "cylinder",
        size: [0.38, 0.32, 0.56],
        position: [pool.x - deckWidth / 2 + 0.6, 0.28, pool.z + end * (deckDepth / 2 - 0.65)],
      },
    })),
    ...[1, -1].map<Part>((end) => ({
      id: `${code}/pool/planter-shrub-${end}`,
      group: "furniture",
      material: "hedge",
      shape: {
        kind: "icosahedron",
        size: [0.42],
        position: [pool.x - deckWidth / 2 + 0.6, 0.75, pool.z + end * (deckDepth / 2 - 0.65)],
      },
    })),
  );

  return parts;
}

export interface PlotPartsInput {
  code: string;
  rearDepth: number;
  walls: Array<{ x: number; z: number; width: number; depth: number; height: number }>;
  garage: GarageSpec | null;
  pool: PoolSpec | null;
  seed: number;
  lowQuality?: boolean;
}

/** Every piece of a private plot, in plot-local space. */
export function plotParts({ code, walls, garage, pool, seed, lowQuality = false }: PlotPartsInput): Part[] {
  return [
    ...wallParts(code, walls),
    ...(garage ? carportParts(code, garage, seed, lowQuality) : []),
    ...(pool ? poolParts(code, pool) : []),
  ];
}

export function partCentre(bounds: PartBounds): { x: number; z: number } {
  return { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
}

/** Rough triangle budget of a part collection — used by the performance report. */
export function partTriangleBudget(parts: Part[]): number {
  let total = 0;
  for (const part of parts) {
    switch (part.shape.kind) {
      case "box":
        total += 12;
        break;
      case "cylinder":
        total += 44;
        break;
      case "icosahedron":
        total += 80;
        break;
      case "torus":
        total += 160;
        break;
    }
  }
  return total;
}

export { TAU };
