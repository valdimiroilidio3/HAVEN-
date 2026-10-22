"use client";

import * as React from "react";
import { MeshReflectorMaterial } from "@react-three/drei";
import { SITE } from "@/lib/3d/site";
import type { PartMaterial } from "@/lib/3d/parts";
import { LAGOON_WATER, lagoonLayout, onDeckRing } from "@/lib/3d/lagoon";
import { POOL_COLORS } from "../vegetation";
import { getMaterials } from "../materials";
import { buildLagoonGeometries, deckPavingGeometry } from "./lagoon-geometry";

/**
 * The condominium pool.
 *
 * The module and the `SITE.lagoon` key keep their names — that identifier is the
 * spatial key shared by the plan, the rules and the viewer, and renaming it would
 * be repository-wide churn with no spatial gain. The programme changed: mosaic
 * basin, clean water, no aquatic planting.
 *
 * Everything here is derived from `lib/3d/lagoon.ts`: the deck, coping, boardwalk,
 * steps, pavilion, planting and lights are declarative parts merged per material
 * (~250 primitives into about a dozen meshes), and the validator checks those
 * same parts against the water and the deck edge.
 *
 * The water is built in two zones on purpose: a reflective deep centre, and a
 * transparent shallow ring at the rim so the tiled shelf, the submerged steps
 * and the lilies stay visible. A single sheet either hides the basin or loses
 * the reflection.
 */

function Water({
  night,
  lowQuality,
}: {
  night: boolean;
  lowQuality: boolean;
}) {
  const m = getMaterials();
  const colors = night ? POOL_COLORS.night : POOL_COLORS.day;
  const rx = LAGOON_WATER.radiusX;
  const rz = LAGOON_WATER.radiusZ;

  // Performance mode: one translucent sheet, no extra render pass.
  if (lowQuality) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LAGOON_WATER.y, 0]} scale={[rx - 0.15, rz - 0.15, 1]} material={night ? m.waterNight : m.poolWater}>
        <circleGeometry args={[1, 64]} />
      </mesh>
    );
  }

  return (
    <>
      {/* Deep centre: mirrors the pavilion, the tree line and the sky. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LAGOON_WATER.y, 0]} scale={[rx * 0.86, rz * 0.86, 1]}>
        <circleGeometry args={[1, 96]} />
        <MeshReflectorMaterial
          resolution={256}
          blur={[320, 96]}
          mixBlur={1.15}
          mixStrength={night ? 2.6 : 2.1}
          mixContrast={1.05}
          mirror={0.8}
          depthScale={0.9}
          minDepthThreshold={0.25}
          maxDepthThreshold={1.35}
          distortion={0.22}
          color={night ? colors.water : "#2c7386"}
          roughness={night ? 0.14 : 0.2}
          metalness={0.55}
          envMapIntensity={night ? 0.9 : 1.3}
        />
      </mesh>
      {/* Shallow rim: clear water over the mosaic shelf and the steps. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LAGOON_WATER.y - 0.005, 0]} scale={[rx - 0.12, rz - 0.12, 1]}>
        <ringGeometry args={[0.86, 1, 96]} />
        <meshStandardMaterial
          color={night ? colors.water : "#4c9fb0"}
          roughness={0.08}
          metalness={0.4}
          transparent
          opacity={night ? 0.5 : 0.42}
          envMapIntensity={1.6}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

export function Lagoon({ night, lowQuality }: { night: boolean; lowQuality: boolean }) {
  const m = getMaterials();
  const { x, z, radiusX, radiusZ, deck } = SITE.lagoon;
  const { layout, geometries } = React.useMemo(() => buildLagoonGeometries({ lowQuality }), [lowQuality]);
  const colors = night ? POOL_COLORS.night : POOL_COLORS.day;

  const resolve = React.useCallback(
    (key: PartMaterial) => {
      switch (key) {
        case "water":
          return night ? m.waterNight : m.poolWater;
        case "glass":
          return night ? m.glassNight : m.glass;
        case "reed":
          return m.hedge;
        case "lily":
          return m.foliage[1]!;
        case "rock":
          return m.gravel;
        case "foliage0":
          return m.foliage[0]!;
        case "foliage1":
          return m.foliage[1]!;
        case "foliage2":
          return m.foliage[2]!;
        case "carPaint0":
        case "carPaint1":
        case "carPaint2":
          return m.carPaint[0]!;
        case "carGlass":
          return m.carGlass;
        case "poolTile":
          return m.poolTile;
        case "lamp":
          return m.lampGlass;
        default:
          return m[key];
      }
    },
    [m, night],
  );

  const bollardLights = React.useMemo(() => {
    // Every second bollard casts light; the rest are emissive heads.
    return lagoonLayout({ lowQuality })
      .parts.filter((part) => part.id.endsWith("/head") && Number(part.id.split("/")[2]) % 2 === 0)
      .map((part) => part.shape.position);
  }, [lowQuality]);

  const pavilionLocalZ = SITE.pavilion.z - SITE.lagoon.z;

  return (
    <group position={[x, 0, z]}>
      {/* Paving is an annulus, not a disc: the aperture is the water. A filled
          circle here sits 6 cm above the surface and hides the entire basin. */}
      <mesh geometry={deckPavingGeometry({ radiusX, radiusZ, deck, segments: layout.segments })} position={[0, 0.08, 0]} material={m.stone} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.085, 0]} scale={[radiusX, radiusZ, 1]} material={m.concrete} receiveShadow>
        <ringGeometry args={[1, 1.05, layout.segments]} />
      </mesh>

      {/* Basin: mosaic wall, a deep tiled floor, and a lighter shelf under the rim
          that shows through the transparent shallow water. */}
      <mesh position={[0, LAGOON_WATER.floorY / 2, 0]} scale={[radiusX + 0.22, 1, radiusZ + 0.22]} material={m.poolTile}>
        <cylinderGeometry args={[1, 1, Math.abs(LAGOON_WATER.floorY), 96, 1, true]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LAGOON_WATER.floorY, 0]} scale={[radiusX, radiusZ, 1]} material={m.poolTile} receiveShadow>
        <circleGeometry args={[1, 96]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LAGOON_WATER.floorY + 0.28, 0]} scale={[radiusX, radiusZ, 1]} material={m.concrete} receiveShadow>
        <ringGeometry args={[0.88, 1, layout.segments]} />
      </mesh>

      <Water night={night} lowQuality={lowQuality} />

      {/* Merged structure, deck detail, furniture, planting and bollards. */}
      {(Object.keys(geometries) as PartMaterial[]).map((key) => (
        <mesh key={key} geometry={geometries[key]} material={resolve(key)} castShadow receiveShadow />
      ))}

      {night && (
        <>
          <pointLight position={[0, 0.9, 0]} intensity={9} distance={34} decay={2} color={colors.water} />
          <pointLight position={[0, 3.4, pavilionLocalZ]} intensity={5} distance={18} decay={2} color="#ffcf9a" />
          {!lowQuality &&
            bollardLights.map(([bx, , bz], index) => (
              <pointLight key={index} position={[bx, 1.05, bz]} intensity={1.6} distance={7} decay={2} color="#ffbe83" />
            ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LAGOON_WATER.y + 0.015, 0]} scale={[radiusX * 0.94, radiusZ * 0.94, 1]} material={m.poolLight}>
            <ringGeometry args={[0.985, 1, 96]} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Kept for the plan renderer: the deck silhouette in world space. */
export function lagoonDeckCorners(): Array<{ x: number; z: number }> {
  const corners: Array<{ x: number; z: number }> = [];
  for (let angle = 0; angle < 360; angle += 15) {
    const point = onDeckRing(angle, 1);
    corners.push({ x: SITE.lagoon.x + point.x, z: SITE.lagoon.z + point.z });
  }
  return corners;
}
