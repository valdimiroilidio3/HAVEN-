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

type GeometryKey =
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
  // stone sill
  if (ext.bottom > 0.5) {
    addBox(
      bucket,
      "concrete",
      [width + 0.2, 0.06, plan.exteriorWallThickness + 0.16],
      [groupPos[0], ext.bottom - 0.03, groupPos[2] + (isH ? 0 : 0)],
      groupRot,
    );
  }
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
  // canopy
  addBox(bucket, "charcoal", [width + 1.5, 0.18, 1.65], local(0, height + 0.55, 0.75), rotation);
  addBox(bucket, "metal", [0.09, height + 0.5, 0.09], local(-width / 2 - 0.45, 0, 1.4), rotation);
  addBox(bucket, "metal", [0.09, height + 0.5, 0.09], local(width / 2 + 0.45, 0, 1.4), rotation);
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
    addBox(bucket, "glassRail", [width, 1.05, 0.035], [cx, y + 0.68, slabZ + depth / 2]);
    addBox(bucket, "metal", [width, 0.05, 0.07], [cx, y + 1.22, slabZ + depth / 2]);
    for (const side of [-1, 1]) {
      addBox(bucket, "glassRail", [0.03, 1.05, depth - 0.1], [cx + (side * width) / 2, y + 0.68, slabZ]);
      addBox(bucket, "metal", [0.06, 1.1, 0.06], [cx + (side * width) / 2, y + 0.7, slabZ + depth / 2]);
    }
  }
}

function addRoof(bucket: Bucket, plan: FloorPlan, config: HouseConfig) {
  if (!config.upper) {
    addBox(bucket, "charcoal", [plan.widthM + 2.0, 0.34, plan.depthM + 2.0], [0, config.groundH + 0.13, 0]);
    addBox(bucket, "render", [plan.widthM + 1.7, 0.09, plan.depthM + 1.7], [0, config.groundH - 0.05, 0]);
    return;
  }
  addBox(bucket, "charcoal", [plan.widthM + 2.2, 0.26, plan.depthM + 2.2], [0, config.groundH + 0.02, 0]);
  addBox(bucket, "render", [plan.widthM + 2.45, 0.09, plan.depthM + 2.45], [0, config.groundH - 0.12, 0]);
  const W = plan.widthM * config.upperW;
  const D = plan.depthM * config.upperD;
  const cx = plan.widthM * config.upperOffsetX;
  const cz = plan.depthM * config.upperOffsetZ;
  addBox(bucket, "charcoal", [W + 1.6, 0.32, D + 1.6], [cx, config.groundH + config.upperH + 0.12, cz]);
  if (config.chimney) {
    addBox(bucket, "charcoal", [0.62, 1.5, 0.62], [cx + W * 0.22, config.groundH + config.upperH + 0.98, cz - D * 0.22]);
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

  addBox(bucket, "stone", [plan.widthM + 0.9, 0.16, plan.depthM + 0.9], [0, 0.02, 0]);
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
