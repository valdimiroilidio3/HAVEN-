import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { plotParts, type Part, type PartMaterial, type PlotPartsInput } from "@/lib/3d/parts";

/**
 * Turns a plot's part descriptors into one merged BufferGeometry per material.
 *
 * A private plot is ~70 primitives (walls, carport, two cars, pool, furniture).
 * Rendered naively that is ~70 draw calls per plot; merged by material it is
 * 10–14, which is what keeps thirteen fully-fitted plots interactive.
 */

/**
 * Plot meshes are shared by every mount of the same plot (day/night, quality
 * toggles). The cache is bounded so switching settings does not leak GPU
 * memory: the oldest entry is disposed when the limit is reached.
 */
const CACHE_LIMIT = 32;
const cache = new Map<string, Record<string, THREE.BufferGeometry>>();

function evictIfNeeded(): void {
  while (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) return;
    const geometries = cache.get(oldest.value);
    cache.delete(oldest.value);
    if (geometries) for (const geometry of Object.values(geometries)) geometry?.dispose();
  }
}

function geometryFor(part: Part): THREE.BufferGeometry | null {
  const { kind, size } = part.shape;
  switch (kind) {
    case "box":
      return new THREE.BoxGeometry(size[0] ?? 0.1, size[1] ?? 0.1, size[2] ?? 0.1);
    case "cylinder":
      return new THREE.CylinderGeometry(size[0] ?? 0.1, size[1] ?? 0.1, size[2] ?? 0.1, 12);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(size[0] ?? 0.1, 1);
    case "torus":
      return new THREE.TorusGeometry(size[0] ?? 0.1, size[1] ?? 0.02, 8, 16);
    default:
      return null;
  }
}

function transformFor(part: Part): THREE.Matrix4 {
  const position = new THREE.Vector3(...part.shape.position);
  const rotation = part.shape.rotation ?? [0, 0, 0];
  const scale = part.shape.scale ?? [1, 1, 1];
  return new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
}

/**
 * Merge primitives into one geometry per material.
 *
 * Shared by the private plots and the lagoon. Indexing is normalised first:
 * `BoxGeometry` is indexed and `IcosahedronGeometry` is not, and three refuses
 * to merge a mixture — which is exactly the kind of failure that would leave a
 * rock or a canopy silently missing from the scene.
 */
export function mergePartsByMaterial(parts: Part[]): Partial<Record<PartMaterial, THREE.BufferGeometry>> {
  const buckets = new Map<PartMaterial, THREE.BufferGeometry[]>();
  for (const part of parts) {
    const geometry = geometryFor(part);
    if (!geometry) continue;
    geometry.applyMatrix4(transformFor(part));
    const bucket = buckets.get(part.material) ?? [];
    bucket.push(geometry);
    buckets.set(part.material, bucket);
  }

  const merged: Partial<Record<PartMaterial, THREE.BufferGeometry>> = {};
  for (const [material, list] of buckets) {
    const anyNonIndexed = list.some((geometry) => !geometry.index);
    const normalised = anyNonIndexed ? list.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry)) : list;
    const result = normalised.length === 1 ? normalised[0]! : mergeGeometries(normalised, false);
    if (!result) continue;
    result.computeBoundingSphere();
    result.computeBoundingBox();
    merged[material] = result;
    // Dispose the intermediates, including the ones produced by toNonIndexed().
    if (list.length > 1 || anyNonIndexed) for (const geometry of new Set([...list, ...normalised])) geometry.dispose();
  }
  return merged;
}

export function buildPlotGeometries(input: PlotPartsInput): {
  parts: Part[];
  geometries: Partial<Record<PartMaterial, THREE.BufferGeometry>>;
} {
  const key = [
    input.code,
    input.rearDepth,
    input.pool ? `${input.pool.width}x${input.pool.depth}:${input.pool.deck}:${input.pool.x}:${input.pool.z}` : "nopool",
    input.garage ? `${input.garage.width}x${input.garage.depth}:${input.garage.x}:${input.garage.z}:${input.garage.bays}:${input.garage.walled}` : "nocarport",
    input.lowQuality ? "q0" : "q1",
    input.walls.map((wall) => `${wall.x}:${wall.z}:${wall.width}:${wall.depth}:${wall.height}`).join("|"),
  ].join("#");

  const parts = plotParts(input);
  const cached = cache.get(key);
  if (cached) return { parts, geometries: cached as Partial<Record<PartMaterial, THREE.BufferGeometry>> };

  const geometries = mergePartsByMaterial(parts);
  evictIfNeeded();
  cache.set(key, geometries as Record<string, THREE.BufferGeometry>);
  return { parts, geometries };
}

/** Release every cached plot mesh (used on hot reload and in tests). */
export function disposePlotGeometries(): void {
  for (const geometries of cache.values()) {
    for (const geometry of Object.values(geometries)) geometry?.dispose();
  }
  cache.clear();
}

export function plotGeometryStats(): { plots: number; drawCalls: number } {
  let drawCalls = 0;
  for (const geometries of cache.values()) drawCalls += Object.keys(geometries).length;
  return { plots: cache.size, drawCalls };
}
