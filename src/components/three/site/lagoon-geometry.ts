import * as THREE from "three";
import type { PartMaterial } from "@/lib/3d/parts";
import type { LagoonLayout } from "@/lib/3d/lagoon";
import { lagoonLayout } from "@/lib/3d/lagoon";
import { mergePartsByMaterial } from "./plot-geometry";

/**
 * The lagoon's meshes, merged per material.
 *
 * The deck alone is ~250 primitives (coping segments, boardwalk planks, reeds,
 * rafters). Drawn individually that would be 250 draw calls for one feature;
 * merged by material it is about a dozen.
 */

const cache = new Map<string, Partial<Record<PartMaterial, THREE.BufferGeometry>>>();

export function buildLagoonGeometries(input: { lowQuality: boolean }): {
  layout: LagoonLayout;
  geometries: Partial<Record<PartMaterial, THREE.BufferGeometry>>;
} {
  const key = input.lowQuality ? "q0" : "q1";
  const layout = lagoonLayout({ lowQuality: input.lowQuality });
  const cached = cache.get(key);
  if (cached) return { layout, geometries: cached };

  const geometries = mergePartsByMaterial(layout.parts);
  cache.set(key, geometries);
  return { layout, geometries };
}

/** Release the cached lagoon meshes (hot reload and tests). */
export function disposeLagoonGeometries(): void {
  for (const geometries of cache.values()) {
    for (const geometry of Object.values(geometries)) geometry?.dispose();
  }
  cache.clear();
}

export function lagoonGeometryStats(): { variants: number; drawCalls: number; triangles: number } {
  let drawCalls = 0;
  let triangles = 0;
  for (const geometries of cache.values()) {
    for (const geometry of Object.values(geometries)) {
      if (!geometry) continue;
      drawCalls += 1;
      triangles += (geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / 3;
    }
  }
  return { variants: cache.size, drawCalls, triangles };
}

/**
 * Paving with a hole where the water is.
 *
 * The lagoon is an ellipse of water inside an elliptical deck. Drawn as a filled
 * `CircleGeometry` the deck renders *over* the water — it sits 6 cm higher — and
 * the basin disappears behind a stone disc. These helpers build the paved band
 * as a true elliptical annulus, so the aperture is exactly the water ellipse.
 *
 * Both rings are cached: they are created once per scene, never per frame.
 */
function ellipticalRingGeometry(
  outerX: number,
  outerZ: number,
  innerX: number,
  innerZ: number,
  segments: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, outerX, outerZ, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, innerX, innerZ, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape, segments);
  // Shape space is XY; rotate flat so +Y becomes +Z.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

let deckPaving: THREE.BufferGeometry | null = null;
let deckPavingKey = "";
let lagoonVerge: THREE.BufferGeometry | null = null;
let lagoonVergeKey = "";

/** Deck paving: from the water edge out to `deck` metres. */
export function deckPavingGeometry(input: { radiusX: number; radiusZ: number; deck: number; segments: number }): THREE.BufferGeometry {
  const key = `${input.radiusX}:${input.radiusZ}:${input.deck}`;
  if (!deckPaving || deckPavingKey !== key) {
    deckPaving?.dispose();
    deckPavingKey = key;
    deckPaving = ellipticalRingGeometry(
      input.radiusX + input.deck,
      input.radiusZ + input.deck,
      input.radiusX,
      input.radiusZ,
      Math.max(24, Math.round(input.segments / 2)),
    );
  }
  return deckPaving;
}

/** Grass verge around the deck: never a disc, or it would hide the water too. */
export function lagoonVergeGeometry(input: {
  radiusX: number;
  radiusZ: number;
  deck: number;
  margin: number;
  segments: number;
}): THREE.BufferGeometry {
  const key = `${input.radiusX}:${input.radiusZ}:${input.deck}:${input.margin}`;
  if (!lagoonVerge || lagoonVergeKey !== key) {
    lagoonVerge?.dispose();
    lagoonVergeKey = key;
    lagoonVerge = ellipticalRingGeometry(
      input.radiusX + input.deck + input.margin,
      input.radiusZ + input.deck + input.margin,
      input.radiusX + input.deck,
      input.radiusZ + input.deck,
      Math.max(24, Math.round(input.segments / 2)),
    );
  }
  return lagoonVerge;
}

export function disposeLagoonSurfaces(): void {
  deckPaving?.dispose();
  deckPaving = null;
  deckPavingKey = "";
  lagoonVerge?.dispose();
  lagoonVerge = null;
  lagoonVergeKey = "";
}
