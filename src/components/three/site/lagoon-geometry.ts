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
