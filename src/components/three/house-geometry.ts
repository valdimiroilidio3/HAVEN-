import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FloorPlan, PlanOpening } from "@/lib/domain/floorplans";
import { deriveOpenings, deriveWalls, openingExtents } from "@/lib/domain/plan-geometry";

/**
 * Builds every static element of a prototype house and merges it per material.
 * A house becomes ~10 draw calls instead of several hundred, which keeps the
 * 13-unit scene interactive on mid-range hardware.
 *
 * Purely a geometry factory: materials are owned by the scene.
 */

export interface HouseConfig {
  upper: boolean;
  groundH: number;
  upperH: number;
  upperW: number;
  upperD: number;
  upperOffsetX: number;
  upperOffsetZ: number;
  upperMaterial: "timber" | "render" | "stone";
  balcony: boolean;
  balconyDepth: number;
  pergola: boolean;
  screen: boolean;
  stoneRear: boolean;
  chimney: boolean;
}

export const HOUSE_CONFIG: Record<string, HouseConfig> = {
  T1: {
    upper: false,
    groundH: 3.35,
    upperH: 0,
    upperW: 0,
    upperD: 0,
    upperOffsetX: 0,
    upperOffsetZ: 0,
    upperMaterial: "render",
    balcony: false,
    balconyDepth: 0,
    pergola: true,
    screen: false,
    stoneRear: false,
    chimney: false,
  },
  T2: {
    upper: true,
    groundH: 3.05,
    upperH: 2.85,
    upperW: 0.56,
    upperD: 0.78,
    upperOffsetX: 0.17,
    upperOffsetZ: -0.04,
    upperMaterial: "timber",
    balcony: false,
    balconyDepth: 0,
    pergola: true,
    screen: true,
    stoneRear: true,
    chimney: true,
  },
  T3: {
    upper: true,
    groundH: 3.25,
    upperH: 2.9,
    upperW: 0.74,
    upperD: 0.86,
    upperOffsetX: -0.14,
    upperOffsetZ: 0.02,
    upperMaterial: "render",
    balcony: true,
    balconyDepth: 1.9,
    pergola: true,
    screen: true,
    stoneRear: true,
    chimney: false,
  },
  T4: {
    upper: true,
    groundH: 3.4,
    upperH: 3.0,
    upperW: 0.66,
    upperD: 0.84,
    upperOffsetX: 0.2,
    upperOffsetZ: -0.02,
    upperMaterial: "stone",
    balcony: true,
    balconyDepth: 2.3,
    pergola: true,
    screen: true,
    stoneRear: true,
    chimney: true,
  },
};

/**
 * Architectural detail constants.
 *
 * One place for every dimension that is *presentation* rather than approved
 * architecture: wall footprints, storey heights and the floor plans themselves
 * stay exactly as they are. These numbers only control how the roof sits on the
 * walls, how far a sill projects, how deep the plinth reads.
 */
export const HOUSE_DETAIL = {
  /** Eave/parapet projection beyond the wall face. */
  roofOverhang: 0.55,
  /** Roof field thickness. */
  roofThickness: 0.2,
  /** Visible edge band, taller than the field so it reads as a fascia. */
  fasciaHeight: 0.26,
  /** Soffit board under the overhang — the shadow line that stops a floating lid. */
  soffitThickness: 0.055,
  /** Plinth height above grade and how far it stands proud of the wall. */
  plinthHeight: 0.22,
  plinthProjection: 0.08,
  /** Window sill projection beyond the wall face. */
  sillProjection: 0.11,
  /** How far the dark interior backdrop sits behind the glazing. */
  interiorInset: 0.24,
} as const;

type GeometryKey =
  | "interior"
  | "stone"
  | "render"
  | "charcoal"
  | "metal"
  | "timber"
  | "timberDark"
  | "glass"
  | "glassRail"
  | "concrete"
  | "deck"
  | "gravel";

export type HouseGeometrySet = Partial<Record<GeometryKey, THREE.BufferGeometry>>;

interface Piece {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

type Bucket = Record<string, Piece[]>;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h);

function add(bucket: Bucket, key: GeometryKey, piece: Piece): void {
  (bucket[key] ??= []).push(piece);
}

function addBox(
  bucket: Bucket,
  key: GeometryKey,
  size: [number, number, number],
  position: [number, number, number],
  rotation?: [number, number, number],
): void {
  add(bucket, key, { geometry: box(...size), position, rotation });
}

function mergeBucket(pieces: Piece[] | undefined): THREE.BufferGeometry | null {
  if (!pieces || pieces.length === 0) return null;
  const prepared = pieces.map((piece) => {
    const g = piece.geometry.clone();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...piece.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(piece.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(...(piece.scale ?? [1, 1, 1])),
    );
    g.applyMatrix4(matrix);
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  prepared.forEach((g) => g.dispose());
  pieces.forEach((p) => p.geometry.dispose());
  return merged;
}

/** Ridge/parapet height above grade: the two storeys plus the roof edge. */
export function houseHeaderHeight(config: HouseConfig): number {
  return config.groundH + config.upperH + HOUSE_DETAIL.fasciaHeight;
}

/** Roof plan extent: walls plus the overhang on both sides. */
export function roofExtent(plan: FloorPlan): { width: number; depth: number } {
  return { width: plan.widthM + HOUSE_DETAIL.roofOverhang * 2, depth: plan.depthM + HOUSE_DETAIL.roofOverhang * 2 };
}

/* ── Ground-floor walls from the plan ─────────────────────────────────── */

function addWalls(bucket: Bucket, plan: FloorPlan, config: HouseConfig) {
  const walls = deriveWalls(plan);
  for (const wall of walls) {
    for (const component of wall.components) {
      const span = component.end - component.start;
      const height = component.top - component.bottom;
      if (span <= 0.01 || height <= 0.01) continue;
      const position: [number, number, number] =
        wall.orientation === "h"
          ? [(component.start + component.end) / 2, component.bottom + height / 2, wall.at]
          : [wall.at, component.bottom + height / 2, (component.start + component.end) / 2];
      const size: [number, number, number] =
        wall.orientation === "h" ? [span, height, wall.thickness] : [wall.thickness, height, span];
      if (wall.exterior) {
        const isRear = wall.orientation === "h" && wall.at < 0;
        const key: GeometryKey = config.stoneRear && isRear && component.bottom < 0.5 ? "stone" : "render";
        addBox(bucket, key, size, position);
      } else {
        addBox(bucket, "render", size, position);
      }
    }
  }
}

/* ── Glazing ──────────────────────────────────────────────────────────── */

function addOpening(bucket: Bucket, plan: FloorPlan, opening: PlanOpening) {
  const ext = openingExtents(opening.type, plan.wallHeightM);
  const isH = opening.orientation === "h";
  const outward = opening.at > 0 ? 1 : -1;
  const offset = outward * (plan.exteriorWallThickness / 2 + 0.02);
  const width = opening.width - 0.05;
  const height = ext.top - ext.bottom;
  const centerY = (ext.top + ext.bottom) / 2;
  const groupPos: [number, number, number] = isH
    ? [opening.center, centerY, opening.at + offset]
    : [opening.at + offset, centerY, opening.center];
  const groupRot: [number, number, number] = isH ? [0, 0, 0] : [0, Math.PI / 2, 0];

  // Glass
  add(bucket, "glass", { geometry: box(width, height, 0.025), position: groupPos, rotation: groupRot });

  // Interior backdrop. The walls are built with real holes for the openings, so
  // a dark panel set back 24 cm gives the glazing depth instead of letting it
  // read as a decal stuck to the facade.
  const inward = -outward * (plan.exteriorWallThickness / 2 + HOUSE_DETAIL.interiorInset);
  // Full-height glazing would carry its backdrop below grade; lift it so the
  // panel always starts a couple of centimetres above the floor.
  const backdropH = height + 0.3;
  const backdropCenter = Math.max(groupPos[1], backdropH / 2 + 0.02);
  add(bucket, "interior", {
    geometry: box(width + 0.3, backdropH, 0.02),
    position: isH ? [groupPos[0], backdropCenter, groupPos[2] + inward] : [groupPos[0] + inward, backdropCenter, groupPos[2]],
    rotation: groupRot,
  });

  const localToWorld = (lx: number, ly: number, lz: number): [number, number, number] => {
    if (isH) return [groupPos[0] + lx, groupPos[1] + ly, groupPos[2] + lz];
    return [groupPos[0] + lz, groupPos[1] + ly, groupPos[2] - lx];
  };

  const frame = 0.055;
  const depth = 0.09;
  // top/bottom rails
  addBox(bucket, "charcoal", [width + 0.1, frame, depth], localToWorld(0, height / 2, 0), groupRot);
  addBox(bucket, "charcoal", [width + 0.1, frame, depth], localToWorld(0, -height / 2, 0), groupRot);
  // jambs
  addBox(bucket, "charcoal", [frame, height, depth], localToWorld(-width / 2, 0, 0), groupRot);
  addBox(bucket, "charcoal", [frame, height, depth], localToWorld(width / 2, 0, 0), groupRot);
  // mullions
  const mullions = Math.max(1, Math.round(width / 1.35));
  for (let i = 1; i < mullions; i++) {
    const x = -width / 2 + (width / mullions) * i;
    addBox(bucket, "charcoal", [0.035, height, depth * 0.75], localToWorld(x, 0, 0), groupRot);
  }
  // Sill: projects beyond the face on the outside, flush inside.
  if (ext.bottom > 0.5) {
    const sillDepth = plan.exteriorWallThickness + HOUSE_DETAIL.sillProjection * 2;
    const sillOffset = outward * 0.02;
    addBox(
      bucket,
      "concrete",
      [width + 0.22, 0.06, sillDepth],
      isH
        ? [groupPos[0], ext.bottom - 0.03, groupPos[2] + sillOffset]
        : [groupPos[0] + sillOffset, ext.bottom - 0.03, groupPos[2]],
      groupRot,
    );
  }
  // Head: a slim projecting drip keeps rain off the frame and catches a shadow.
  addBox(
    bucket,
    "concrete",
    [width + 0.26, 0.05, plan.exteriorWallThickness + 0.1],
    isH ? [groupPos[0], ext.top + 0.03, groupPos[2]] : [groupPos[0], ext.top + 0.03, groupPos[2]],
    groupRot,
  );
}

function addEntranceDoor(bucket: Bucket, plan: FloorPlan, opening: PlanOpening) {
  const isH = opening.orientation === "h";
  const outward = opening.at > 0 ? 1 : -1;
  const offset = outward * (plan.exteriorWallThickness / 2 + 0.03);
  const height = 2.18;
  const width = opening.width - 0.06;
  const position: [number, number, number] = isH
    ? [opening.center, height / 2, opening.at + offset]
    : [opening.at + offset, height / 2, opening.center];
  const rotation: [number, number, number] = isH ? [0, 0, 0] : [0, Math.PI / 2, 0];
  const local = (lx: number, ly: number, lz: number): [number, number, number] =>
    isH ? [position[0] + lx, position[1] + ly, position[2] + lz] : [position[0] + lz, position[1] + ly, position[2] - lx];

  addBox(bucket, "timberDark", [width + 0.18, height + 0.12, 0.05], local(0, 0.03, -0.03), rotation);
  addBox(bucket, "timber", [width, height, 0.09], position, rotation);
  addBox(bucket, "metal", [width * 0.02, height * 0.97, 0.01], local(0, 0, 0.055), rotation);
  add(bucket, "metal", {
    geometry: new THREE.CapsuleGeometry(0.018, 0.42, 3, 8),
    position: local(width * 0.36, 0, 0.09),
  });
  // Canopy: a flat slab on two posts. The posts must span grade to the slab
  // soffit exactly — the previous version was centred on the door midpoint, so
  // it started 25 cm underground and stopped 30 cm short of the canopy.
  const canopyY = height + 0.55;
  const canopyThickness = 0.18;
  const postTop = canopyY - canopyThickness / 2;
  const postHeight = postTop;
  addBox(bucket, "charcoal", [width + 1.5, canopyThickness, 1.65], local(0, canopyY, 0.75), rotation);
  for (const side of [-1, 1]) {
    addBox(
      bucket,
      "metal",
      [0.09, postHeight, 0.09],
      local(side * (width / 2 + 0.45), postTop - postHeight / 2 - height / 2, 1.4),
      rotation,
    );
  }
  // Threshold apron: the floor and the grade are both at y = 0 here, so this is
  // flush paving, not a step. It reads as a proper entrance landing and stops the
  // door meeting the lawn edge-on.
  addBox(bucket, "stone", [width + 0.7, 0.05, 0.95], local(0, 0.005 - height / 2, 0.45), rotation);
}

/* ── Upper storey ─────────────────────────────────────────────────────── */

function addUpper(bucket: Bucket, plan: FloorPlan, config: HouseConfig, seed: number) {
  if (!config.upper) return;
  const W = plan.widthM * config.upperW;
  const D = plan.depthM * config.upperD;
  const cx = plan.widthM * config.upperOffsetX;
  const cz = plan.depthM * config.upperOffsetZ;
  const y = config.groundH;
  const H = config.upperH;
  const upperKey: GeometryKey = config.upperMaterial === "timber" ? "timber" : config.upperMaterial === "stone" ? "stone" : "render";

  addBox(bucket, upperKey, [W, H, D], [cx, y + H / 2, cz]);
  // Base reveal: a shadow gap where the upper volume meets the terrace slab, so
  // the two storeys read as separate volumes rather than one extruded box.
  addBox(bucket, "charcoal", [W + 0.02, 0.05, D + 0.02], [cx, y + 0.035, cz]);

  // Ribbon window (front) + side
  const bandW = W * 0.7;
  const bandH = 1.7;
  const bandY = y + H * 0.54;
  const zFront = cz + D / 2 + 0.04;
  addBox(bucket, "glass", [bandW, bandH, 0.03], [cx, bandY, zFront]);
  addBox(bucket, "charcoal", [bandW + 0.12, 0.07, 0.12], [cx, bandY + bandH / 2, zFront]);
  addBox(bucket, "charcoal", [bandW + 0.12, 0.07, 0.12], [cx, bandY - bandH / 2, zFront]);
  for (let i = 0; i <= 4; i++) {
    addBox(bucket, "charcoal", [0.04, bandH, 0.09], [cx - bandW / 2 + (bandW / 4) * i, bandY, zFront]);
  }
  const sideZ = cz + D * 0.12;
  addBox(bucket, "glass", [0.03, bandH * 0.8, D * 0.45], [cx + W / 2 + 0.04, bandY, sideZ]);
  addBox(bucket, "charcoal", [0.09, 0.06, D * 0.45], [cx + W / 2 + 0.05, bandY + bandH * 0.4, sideZ]);

  // Vertical timber screen
  if (config.screen) {
    const slats = 15;
    for (let i = 0; i < slats; i++) {
      const x = cx - W / 2 + (W / slats) * (i + 0.5);
      const h = H * (0.82 + ((seed + i) % 5) * 0.03);
      addBox(bucket, "timberDark", [0.1, h, 0.14 + ((seed + i) % 3) * 0.03], [x, y + H * 0.5, zFront + 0.12]);
    }
  }

  if (config.balcony) {
    const depth = config.balconyDepth;
    const width = W * 0.66;
    const slabZ = cz + D / 2 + depth / 2;
    addBox(bucket, "concrete", [width, 0.18, depth], [cx, y + 0.06, slabZ]);
    // Slab soffit: reads as cast concrete rather than a paper-thin shelf.
    addBox(bucket, "charcoal", [width - 0.05, 0.04, depth - 0.05], [cx, y - 0.03, slabZ]);
    addBox(bucket, "glassRail", [width, 1.05, 0.035], [cx, y + 0.68, slabZ + depth / 2]);
    addBox(bucket, "metal", [width, 0.05, 0.07], [cx, y + 1.22, slabZ + depth / 2]);
    for (const side of [-1, 1]) {
      addBox(bucket, "glassRail", [0.03, 1.05, depth - 0.1], [cx + (side * width) / 2, y + 0.68, slabZ]);
      addBox(bucket, "metal", [0.06, 1.1, 0.06], [cx + (side * width) / 2, y + 0.7, slabZ + depth / 2]);
    }
  }
}

/**
 * A flat roof, built the way one is built.
 *
 * Three parts, in order of what you actually see: a **fascia** (the vertical
 * edge, taller than the roof field), a **soffit** (the board under the
 * overhang, which produces the shadow line) and the **field** (the waterproofed
 * surface, set just below the fascia top so the edge presents a crisp arris).
 *
 * The previous version was a single 0.34 m slab overhanging 1.0 m with nothing
 * under it — from any angle it read as a lid floating above the walls, and the
 * joinery cast a shadow gap that made the house look unfinished.
 *
 * Overhang is `HOUSE_DETAIL.roofOverhang` (0.55 m): enough to weather the facade
 * and read the parapet, small enough to keep the volume honest. Wall footprints
 * and storey heights are untouched.
 */
function addRoof(bucket: Bucket, plan: FloorPlan, config: HouseConfig) {
  const O = HOUSE_DETAIL.roofOverhang;
  const fasciaH = HOUSE_DETAIL.fasciaHeight;
  const soffit = HOUSE_DETAIL.soffitThickness;

  const flatRoof = (width: number, depth: number, cx: number, cz: number, topY: number) => {
    const w = width + O * 2;
    const d = depth + O * 2;
    // Fascia: the visible edge band.
    addBox(bucket, "charcoal", [w, fasciaH, d], [cx, topY - fasciaH / 2, cz]);
    // Field: inset a hair, sitting below the fascia top.
    addBox(bucket, "charcoal", [w - 0.04, HOUSE_DETAIL.roofThickness, d - 0.04], [cx, topY - fasciaH + HOUSE_DETAIL.roofThickness / 2 - 0.01, cz]);
    // Soffit under the overhang, flush with the wall face: the shadow line.
    addBox(bucket, "render", [width + O * 2 - 0.06, soffit, depth + O * 2 - 0.06], [cx, topY - fasciaH - soffit / 2 + 0.01, cz]);
    // Drip: a lip proud of the fascia, so water leaves the building.
    addBox(bucket, "charcoal", [w + 0.05, 0.045, d + 0.05], [cx, topY - fasciaH + 0.02, cz]);
  };

  if (!config.upper) {
    // Single storey: the roof sits directly on the walls.
    flatRoof(plan.widthM, plan.depthM, 0, 0, config.groundH + fasciaH);
    return;
  }

  // Two storeys: the ground floor is capped by a terrace roof that becomes the
  // first-floor deck, then the upper volume carries its own roof.
  flatRoof(plan.widthM, plan.depthM, 0, 0, config.groundH + fasciaH * 0.62);

  const W = plan.widthM * config.upperW;
  const D = plan.depthM * config.upperD;
  const cx = plan.widthM * config.upperOffsetX;
  const cz = plan.depthM * config.upperOffsetZ;
  const topY = config.groundH + config.upperH + fasciaH;
  flatRoof(W, D, cx, cz, topY);

  if (config.chimney) {
    // Seated in the roof, not floating on it: the shaft starts below the field
    // and ends with a cap that oversails it.
    const chimneyX = cx + W * 0.22;
    const chimneyZ = cz - D * 0.22;
    addBox(bucket, "render", [0.62, 1.5, 0.62], [chimneyX, topY + 0.6, chimneyZ]);
    addBox(bucket, "charcoal", [0.74, 0.09, 0.74], [chimneyX, topY + 1.39, chimneyZ]);
  }
}

/* ── Terraces, pergola, planting ──────────────────────────────────────── */

function addTerraces(bucket: Bucket, plan: FloorPlan) {
  for (const terrace of plan.terraces) {
    const w = terrace.x2 - terrace.x1;
    const d = terrace.z2 - terrace.z1;
    const cx = (terrace.x1 + terrace.x2) / 2;
    const cz = (terrace.z1 + terrace.z2) / 2;
    addBox(bucket, terrace.deck === "timber" ? "deck" : "gravel", [w, 0.14, d], [cx, 0.07, cz]);
    // Edge band: without it a 14 cm slab dissolves into the lawn.
    addBox(bucket, "charcoal", [w + 0.04, 0.05, d + 0.04], [cx, 0.025, cz]);
  }
}

function addPergola(bucket: Bucket, plan: FloorPlan, config: HouseConfig) {
  if (!config.pergola) return;
  const terrace = [...plan.terraces]
    .filter((t) => t.deck === "timber")
    .sort((a, b) => (b.x2 - b.x1) * (b.z2 - b.z1) - (a.x2 - a.x1) * (a.z2 - a.z1))[0];
  if (!terrace) return;
  const w = Math.min(terrace.x2 - terrace.x1, 5.2);
  const d = Math.min(terrace.z2 - terrace.z1, 3.6);
  const cx = (terrace.x1 + terrace.x2) / 2;
  const cz = (terrace.z1 + terrace.z2) / 2;
  const postH = 2.7;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    addBox(bucket, "timberDark", [0.1, postH, 0.1], [cx + (sx * (w - 0.24)) / 2, postH / 2, cz + (sz * (d - 0.24)) / 2]);
  }
  addBox(bucket, "timberDark", [w, 0.14, 0.12], [cx, postH, cz - d / 2 + 0.12]);
  addBox(bucket, "timberDark", [w, 0.14, 0.12], [cx, postH, cz + d / 2 - 0.12]);
  for (let i = 0; i < 9; i++) {
    const z = cz - d / 2 + (d / 8) * i;
    addBox(bucket, "timberDark", [w, 0.07, 0.06], [cx, postH + 0.1, z]);
  }
}

/* ── Public builder ───────────────────────────────────────────────────── */

export function buildHouseGeometry(plan: FloorPlan, config: HouseConfig, seed = 1): HouseGeometrySet {
  const bucket: Bucket = {};

  // Plinth: stands 22 cm proud of grade and 8 cm proud of the wall, so the house
  // meets the ground through a base instead of being pasted onto it.
  const P = HOUSE_DETAIL.plinthProjection;
  addBox(
    bucket,
    "stone",
    [plan.widthM + P * 2, HOUSE_DETAIL.plinthHeight, plan.depthM + P * 2],
    [0, HOUSE_DETAIL.plinthHeight / 2 - 0.02, 0],
  );
  addWalls(bucket, plan, config);

  const openings = deriveOpenings(plan);
  for (const opening of openings) {
    const source = plan.openings.find((o) => o.id === opening.id);
    if (!source) continue;
    if (source.type === "door" && source.id.includes("entry")) addEntranceDoor(bucket, plan, source);
    else addOpening(bucket, plan, source);
  }

  addUpper(bucket, plan, config, seed);
  addRoof(bucket, plan, config);
  addTerraces(bucket, plan);
  addPergola(bucket, plan, config);

  const set: HouseGeometrySet = {};
  for (const key of Object.keys(bucket) as GeometryKey[]) {
    const merged = mergeBucket(bucket[key]);
    if (merged) {
      merged.computeBoundingSphere();
      set[key] = merged;
    }
  }
  return set;
}

export function disposeHouseGeometry(set: HouseGeometrySet): void {
  for (const geometry of Object.values(set)) geometry?.dispose();
}
