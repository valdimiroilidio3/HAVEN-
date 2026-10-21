"use client";

import * as React from "react";
import * as THREE from "three";
import { SITE, drivewayFor, type GarageSpec } from "@/lib/3d/site";
import { getMaterials } from "../materials";
import type { SceneEntry } from "./types";

/**
 * Circulation. The circuit is a rounded-rectangle ring drawn from the same
 * `SITE.ring` numbers that `pointOnRoad` uses for collision, so the mesh and the
 * spatial rules cannot drift apart. The boulevard and service road are their
 * own carriageways, each with kerbs and markings.
 */

function roundedRectPath(target: THREE.Shape | THREE.Path, width: number, depth: number, radius: number, cx: number, cz: number, clockwise = false) {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, Math.min(hw, hd));
  // Shape space: x = world x, y = -world z. Rotation -90° about X maps y → z.
  const y = -cz;
  const pts: Array<[number, number]> = [];
  const segments = 6;
  const addArc = (centerX: number, centerY: number, from: number, to: number) => {
    for (let i = 0; i <= segments; i++) {
      const angle = from + ((to - from) * i) / segments;
      pts.push([centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r]);
    }
  };
  // counter-clockwise
  addArc(cx + hw - r, y + hd - r, 0, Math.PI / 2);
  addArc(cx - hw + r, y + hd - r, Math.PI / 2, Math.PI);
  addArc(cx - hw + r, y - hd + r, Math.PI, (3 * Math.PI) / 2);
  addArc(cx + hw - r, y - hd + r, (3 * Math.PI) / 2, Math.PI * 2);
  const ordered = clockwise ? [...pts].reverse() : pts;
  target.moveTo(ordered[0]![0], ordered[0]![1]);
  for (let i = 1; i < ordered.length; i++) target.lineTo(ordered[i]![0], ordered[i]![1]);
  target.closePath();
}

export function Roads() {
  const m = getMaterials();
  const ringGeometry = React.useMemo(() => {
    const outer = SITE.ring.outer;
    const inner = SITE.ring.inner;
    const shape = new THREE.Shape();
    roundedRectPath(shape, outer.maxX - outer.minX, outer.maxZ - outer.minZ, outer.radius, (outer.minX + outer.maxX) / 2, (outer.minZ + outer.maxZ) / 2);
    const hole = new THREE.Path();
    roundedRectPath(hole, inner.maxX - inner.minX, inner.maxZ - inner.minZ, inner.radius, (inner.minX + inner.maxX) / 2, (inner.minZ + inner.maxZ) / 2, true);
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape, 18);
  }, []);
  React.useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);

  const boulevard = SITE.boulevard;
  const service = SITE.serviceRoad;
  // Kerb strips along the two straight roads keep the grass edge crisp.
  const kerbs = [
    { x: boulevard.minX - 0.9, z: (boulevard.minZ + boulevard.maxZ) / 2, w: 1.8, d: boulevard.maxZ - boulevard.minZ },
    { x: boulevard.maxX + 0.9, z: (boulevard.minZ + boulevard.maxZ) / 2, w: 1.8, d: boulevard.maxZ - boulevard.minZ },
    { x: (service.minX + service.maxX) / 2, z: service.minZ - 0.9, w: service.maxX - service.minX, d: 1.8 },
    { x: (service.minX + service.maxX) / 2, z: service.maxZ + 0.9, w: service.maxX - service.minX, d: 1.8 },
  ];

  return (
    <group>
      {kerbs.map((kerb, index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[kerb.x, 0.036, kerb.z]} material={m.stone} receiveShadow>
          <planeGeometry args={[kerb.w, kerb.d]} />
        </mesh>
      ))}
      <mesh geometry={ringGeometry} material={m.asphalt} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} receiveShadow />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(boulevard.minX + boulevard.maxX) / 2, 0.045, (boulevard.minZ + boulevard.maxZ) / 2]}
        material={m.asphalt}
        receiveShadow
      >
        <planeGeometry args={[boulevard.maxX - boulevard.minX, boulevard.maxZ - boulevard.minZ]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(service.minX + service.maxX) / 2, 0.045, (service.minZ + service.maxZ) / 2]}
        material={m.asphalt}
        receiveShadow
      >
        <planeGeometry args={[service.maxX - service.minX, service.maxZ - service.minZ]} />
      </mesh>
      {/* centre line + kerb markings on the boulevard */}
      {Array.from({ length: 14 }).map((_, index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.048, 46 + index * 2.4]} material={m.courtLine}>
          <planeGeometry args={[0.16, 1.1]} />
        </mesh>
      ))}
      {/* low stone kerb ring around the lagoon deck */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[SITE.lagoon.x, 0.03, SITE.lagoon.z]} material={m.lawn} receiveShadow>
        <circleGeometry args={[SITE.lagoon.radiusX + SITE.lagoon.deck + 2.4, 64]} />
      </mesh>
    </group>
  );
}

export function Driveways({ entries, plots }: { entries: SceneEntry[]; plots: Array<{ garage: GarageSpec | null }> }) {
  const m = getMaterials();
  const driveways = React.useMemo(
    () =>
      entries
        .map((entry, index) => ({
          entry,
          driveway: drivewayFor(
            entry.position,
            entry.property.typology,
            entry.rotationY,
            plots[index]?.garage?.x ?? 0,
          ),
        }))
        .filter((d): d is { entry: SceneEntry; driveway: NonNullable<ReturnType<typeof drivewayFor>> } => d.driveway !== null),
    [entries, plots],
  );
  return (
    <group>
      {driveways.map(({ entry, driveway }) => (
        <mesh
          key={entry.property.id}
          rotation={[-Math.PI / 2, 0, -((driveway.rotationY * Math.PI) / 180)]}
          position={[driveway.x, 0.043, driveway.z]}
          material={m.gravel}
          receiveShadow
        >
          <planeGeometry args={[driveway.width, driveway.length]} />
        </mesh>
      ))}
    </group>
  );
}
