import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TreeKind } from "@/lib/3d/site";

/**
 * Layered tree canopies.
 *
 * Naïve "one icosahedron per tree" reads as blobs, especially at low sun angles.
 * Each species is instead merged from several overlapping lobes so the
 * silhouette has depth, a lit side and a shaded core. Four species are built
 * once and drawn as instanced meshes, keeping the whole woodland at four draw
 * calls plus trunks.
 */

export interface CanopyBuild {
  geometry: THREE.BufferGeometry;
  /** Trunk height multiplier for this species. */
  trunk: number;
  /** Vertical offset applied to the canopy group when instancing. */
  lift: number;
  /** Base canopy radius in metres (instances scale from here). */
  radius: number;
}

interface Lobe {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
}

function mergeLobes(lobes: Lobe[]): THREE.BufferGeometry {
  const prepared = lobes.map(({ geometry, position, scale, rotation }) => {
    const clone = geometry.clone();
    clone.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation ?? [0, 0, 0]))),
        new THREE.Vector3(...scale),
      ),
    );
    return clone;
  });
  const merged = mergeGeometries(prepared, false) ?? prepared[0]!;
  prepared.forEach((g) => g.dispose());
  lobes.forEach((lobe) => lobe.geometry.dispose());
  return merged;
}

function sphere(detail = 1): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(1, detail);
}

function cone(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(1, 1, 9, 1, false);
}

/** Broadleaf: a rounded crown built from five lobes, slightly irregular. */
function broadleaf(): CanopyBuild {
  const geometry = mergeLobes([
    { geometry: sphere(1), position: [0, 0.1, 0], scale: [1.42, 1.18, 1.4] },
    { geometry: sphere(0), position: [0.86, -0.16, 0.22], scale: [0.86, 0.74, 0.88] },
    { geometry: sphere(0), position: [-0.78, -0.1, -0.34], scale: [0.92, 0.8, 0.9] },
    { geometry: sphere(0), position: [0.16, 0.82, -0.3], scale: [0.82, 0.7, 0.8] },
    { geometry: sphere(0), position: [-0.2, -0.62, 0.62], scale: [0.74, 0.6, 0.74] },
  ]);
  return { geometry, trunk: 1, lift: 0.28, radius: 1.55 };
}

/** Conifer: three stacked skirts tapering to a point. */
function conifer(): CanopyBuild {
  const geometry = mergeLobes([
    { geometry: cone(), position: [0, -0.55, 0], scale: [1.15, 1.5, 1.15] },
    { geometry: cone(), position: [0, 0.15, 0], scale: [0.9, 1.35, 0.9] },
    { geometry: cone(), position: [0, 0.85, 0], scale: [0.62, 1.2, 0.62] },
  ]);
  return { geometry, trunk: 1.28, lift: 0.62, radius: 1.15 };
}

/** Poplar: tall, narrow, slightly leaning crown. */
function poplar(): CanopyBuild {
  const geometry = mergeLobes([
    { geometry: sphere(1), position: [0, 0.2, 0], scale: [0.78, 1.85, 0.78] },
    { geometry: sphere(0), position: [0.24, 1.05, -0.1], scale: [0.5, 0.72, 0.5] },
    { geometry: sphere(0), position: [-0.22, -0.9, 0.12], scale: [0.56, 0.7, 0.56] },
  ]);
  return { geometry, trunk: 1.15, lift: 0.55, radius: 0.95 };
}

/** Olive: low, wide, silvery crown with a gnarled spread. */
function olive(): CanopyBuild {
  const geometry = mergeLobes([
    { geometry: sphere(1), position: [0, 0, 0], scale: [1.55, 0.86, 1.5] },
    { geometry: sphere(0), position: [1.0, -0.18, -0.2], scale: [0.72, 0.48, 0.72] },
    { geometry: sphere(0), position: [-0.9, -0.12, 0.42], scale: [0.8, 0.5, 0.78] },
    { geometry: sphere(0), position: [0.1, 0.42, 0.1], scale: [0.7, 0.4, 0.7] },
  ]);
  return { geometry, trunk: 0.72, lift: 0.2, radius: 1.62 };
}

/** Build once per species; the caller owns disposal. */
export function buildCanopies(): Record<TreeKind, CanopyBuild> {
  return {
    broadleaf: broadleaf(),
    conifer: conifer(),
    poplar: poplar(),
    olive: olive(),
  };
}

/**
 * Per-instance tint. Real canopies vary in hue and value far more than a single
 * material colour allows; a small deterministic spread lifts the whole scene.
 */
export function canopyTint(kind: TreeKind, seed: number, night = false): THREE.Color {
  const palettes: Record<TreeKind, string[]> = {
    broadleaf: ["#5c7a3e", "#6b8a45", "#4f6b36", "#76924c"],
    conifer: ["#33502f", "#3c5b34", "#2c472b", "#48653a"],
    poplar: ["#6f8b47", "#7d9a4f", "#63803e", "#88a257"],
    olive: ["#7f8b64", "#8b9670", "#75815b", "#96a17c"],
  };
  const palette = palettes[kind];
  const choice = palette[Math.abs(Math.floor(seed * 9301 + 49297)) % palette.length]!;
  const color = new THREE.Color(choice);
  if (night) color.multiplyScalar(0.42);
  return color;
}

/** Water surface colour used by the pool material in day and night. */
export const POOL_COLORS = {
  day: { water: "#4f9fae", deep: "#2f7484", coping: "#e6dfd0" },
  night: { water: "#1d6a80", deep: "#12414f", coping: "#b9b3a6" },
} as const;
