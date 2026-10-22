"use client";

import * as React from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { footpaths, type Footpath } from "@/lib/3d/circulation";
import type { SceneEntry } from "./types";

/**
 * Footpaths.
 *
 * The network in `lib/3d/circulation.ts` is one flat ribbon per path, merged
 * into two meshes: verge paths and marked crossings. Drawing the whole network
 * as a single geometry keeps it at two draw calls — the cost is in the ground
 * plane, not here.
 *
 * Ribbons are built as continuous strips: at every joint the two segment
 * normals are averaged and the offset scaled by 1/cos(θ/2), so a corner has a
 * mitred join instead of a notch. Crossings sit slightly higher than the verge
 * paths so they read on top of the asphalt.
 */

interface RibbonInput {
  points: Array<{ x: number; z: number }>;
  width: number;
  y: number;
}

function ribbonGeometry({ points, width, y }: RibbonInput): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const half = width / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const normal = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: -dz / length, z: dx / length };
  };

  let travelled = 0;
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)]!;
    const current = points[i]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;

    // Average the incoming and outgoing normals, then lengthen by 1/cos(θ/2) so
    // the two quads meet exactly on the mitre line.
    const incoming = normal(previous, current);
    const outgoing = normal(current, next);
    let nx = incoming.x + outgoing.x;
    let nz = incoming.z + outgoing.z;
    const length = Math.hypot(nx, nz);
    let scale = 1;
    if (length > 1e-6) {
      nx /= length;
      nz /= length;
      const dot = nx * incoming.x + nz * incoming.z;
      scale = dot > 0.25 ? 1 / dot : 1;
    } else {
      nx = incoming.x;
      nz = incoming.z;
    }

    if (i > 0) travelled += Math.hypot(current.x - previous.x, current.z - previous.z);
    const offset = half * Math.min(scale, 2.4);
    positions.push(current.x + nx * offset, y, current.z + nz * offset);
    positions.push(current.x - nx * offset, y, current.z - nz * offset);
    uvs.push(0, travelled / 4, 1, travelled / 4);

    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeAll(paths: Footpath[], y: number): THREE.BufferGeometry | null {
  const geometries = paths
    .map((path) => ribbonGeometry({ points: path.points, width: path.width, y }))
    .filter((geometry): geometry is THREE.BufferGeometry => geometry !== null);
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

export function Footpaths({ entries, night }: { entries: SceneEntry[]; night: boolean }) {
  const network = React.useMemo(
    () =>
      footpaths(
        entries.map((entry) => ({
          code: entry.property.code,
          position: { x: entry.position.x, z: entry.position.z },
          rotationY: entry.rotationY,
          typology: entry.property.typology,
        })),
      ),
    [entries],
  );

  const geometries = React.useMemo(() => {
    const walks = network.filter((path) => path.kind !== "crossing");
    const crossings = network.filter((path) => path.kind === "crossing");
    return {
      walks: mergeAll(walks, 0.034),
      crossings: mergeAll(crossings, 0.052),
    };
  }, [network]);

  React.useEffect(
    () => () => {
      geometries.walks?.dispose();
      geometries.crossings?.dispose();
    },
    [geometries],
  );

  // Warm pale stone for the walks, a sandier tone for the crossings: both are
  // paving, and neither competes with the asphalt or the lawn.
  const walkColor = night ? "#8f8a7d" : "#d9d2c2";
  const crossingColor = night ? "#7b7263" : "#c9bda6";

  return (
    <group name="footpaths">
      {geometries.walks ? (
        <mesh geometry={geometries.walks} receiveShadow>
          <meshStandardMaterial color={walkColor} roughness={0.94} metalness={0} />
        </mesh>
      ) : null}
      {geometries.crossings ? (
        <mesh geometry={geometries.crossings} receiveShadow>
          <meshStandardMaterial color={crossingColor} roughness={0.88} metalness={0} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Network metrics for the scene HUD and the audit script. */
export function footpathStats(entries: SceneEntry[]): { paths: number; crossings: number; metres: number } {
  const network = footpaths(
    entries.map((entry) => ({
      code: entry.property.code,
      position: { x: entry.position.x, z: entry.position.z },
      rotationY: entry.rotationY,
      typology: entry.property.typology,
    })),
  );
  let metres = 0;
  for (const path of network) {
    for (let i = 1; i < path.points.length; i += 1) {
      const a = path.points[i - 1]!;
      const b = path.points[i]!;
      metres += Math.hypot(b.x - a.x, b.z - a.z);
    }
  }
  return {
    paths: network.length,
    crossings: network.filter((path) => path.kind === "crossing").length,
    metres: Number(metres.toFixed(0)),
  };
}
