"use client";

import * as React from "react";
import * as THREE from "three";
import type { PartMaterial } from "@/lib/3d/parts";
import type { GarageSpec, PoolSpec } from "@/lib/3d/site";
import { plotWallsFor } from "@/lib/3d/site";
import { getMaterials } from "../materials";
import { buildPlotGeometries } from "./plot-geometry";
import type { SceneEntry } from "./types";

/**
 * A private plot: boundary walls, carport with cars, pool with furniture.
 *
 * Geometry comes from `lib/3d/plotParts` and is merged per material by
 * `plot-geometry.ts`, so the whole plot is ~12 draw calls and the scene graph
 * stays shallow. Only the night lighting is per-instance React state.
 */

export interface PlotProps {
  entry: SceneEntry;
  pool: PoolSpec | null;
  garage: GarageSpec | null;
  rearDepth: number;
  night: boolean;
  lowQuality: boolean;
}

export function Plot({ entry, pool, garage, rearDepth, night, lowQuality }: PlotProps) {
  const materials = getMaterials();
  const seed = Number(entry.property.code.replace(/\D/g, "")) || 1;

  const { geometries } = React.useMemo(
    () =>
      buildPlotGeometries({
        code: entry.property.code,
        rearDepth,
        walls: plotWallsFor(entry.property.typology, rearDepth),
        garage,
        pool,
        seed,
        lowQuality,
      }),
    [entry.property.code, entry.property.typology, rearDepth, garage, pool, seed, lowQuality],
  );

  const resolve = React.useCallback(
    (key: PartMaterial): THREE.Material => {
      switch (key) {
        case "water":
          return night ? materials.waterNight : materials.water;
        case "glass":
          return night ? materials.glassNight : materials.glass;
        case "carPaint0":
          return materials.carPaint[0]!;
        case "carPaint1":
          return materials.carPaint[1]!;
        case "carPaint2":
          return materials.carPaint[2]!;
        case "carGlass":
          return materials.carGlass;
        case "trunk":
          return materials.trunk;
        case "foliage0":
          return materials.foliage[0]!;
        case "foliage1":
          return materials.foliage[1]!;
        case "foliage2":
          return materials.foliage[2]!;
        default:
          return materials[key];
      }
    },
    [materials, night],
  );

  const lightZ = garage ? garage.z + garage.depth / 2 - 0.3 : 0;

  return (
    <group position={[entry.position.x, 0, entry.position.z]} rotation={[0, (entry.rotationY * Math.PI) / 180, 0]}>
      {(Object.keys(geometries) as PartMaterial[]).map((key) => (
        <mesh
          key={key}
          geometry={geometries[key]}
          material={resolve(key)}
          castShadow
          receiveShadow
        />
      ))}
      {night && garage && !lowQuality && (
        <pointLight position={[garage.x, 2.2, lightZ]} intensity={2.6} distance={8} decay={2} color="#ffc182" />
      )}
      {night && pool && !lowQuality && (
        <pointLight position={[pool.x, 0.5, pool.z]} intensity={2.4} distance={8} decay={2} color="#7fdcff" />
      )}
    </group>
  );
}
