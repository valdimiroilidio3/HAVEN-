"use client";

import * as React from "react";
import * as THREE from "three";
import { getInteriorMaterials } from "./materials";

/**
 * Kitchen and laundry appliances ("electrodomésticos").
 *
 * Real appliances are what make a kitchen read as a kitchen rather than a run of
 * oak boxes: a stainless fridge column, a black glass oven with a steel handle,
 * an induction hob with pans, an extractor hood, a dishwasher front and a
 * front-loading washer with a glazed door. Everything is procedural geometry and
 * shares one material set, so the cost is a handful of draw calls per house.
 */

interface BoxProps {
  size: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  rotation?: [number, number, number];
  castShadow?: boolean;
}

function Box({ size, position, material, rotation, castShadow = true }: BoxProps) {
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow={castShadow} receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Cylinder({
  args,
  position,
  material,
  rotation,
}: {
  args: [number, number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow>
      <cylinderGeometry args={args} />
    </mesh>
  );
}

/** Tall two-door fridge / fridge-freezer column. */
export function Fridge({ width = 0.85, depth = 0.7 }: { width?: number; depth?: number }) {
  const m = getInteriorMaterials();
  const height = 2.05;
  return (
    <group>
      <Box size={[width, height, depth]} position={[0, height / 2, 0]} material={m.steel} />
      {/* door seams: freezer below, fridge above */}
      <Box size={[width - 0.05, 0.015, 0.01]} position={[0, height * 0.38, depth / 2 + 0.005]} material={m.charcoal} castShadow={false} />
      <Box size={[0.012, height - 0.1, 0.01]} position={[0, height / 2, depth / 2 + 0.005]} material={m.charcoal} castShadow={false} />
      {/* recessed handles */}
      <Box size={[0.04, 0.7, 0.05]} position={[-width / 2 + 0.1, height * 0.62, depth / 2 + 0.03]} material={m.charcoal} />
      <Box size={[0.04, 0.36, 0.05]} position={[-width / 2 + 0.1, height * 0.24, depth / 2 + 0.03]} material={m.charcoal} />
      {/* water dispenser */}
      <Box size={[0.16, 0.24, 0.02]} position={[width / 2 - 0.18, height * 0.68, depth / 2 + 0.012]} material={m.charcoal} castShadow={false} />
      {/* plinth */}
      <Box size={[width - 0.06, 0.08, depth - 0.08]} position={[0, 0.04, 0]} material={m.charcoal} />
    </group>
  );
}

/** Built-in oven: black glass front, steel handle, control dials. */
export function Oven({ width = 0.72 }: { width?: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.6, 0.02]} position={[0, 0.98, 0.34]} material={m.charcoal} />
      <Box size={[width - 0.1, 0.36, 0.015]} position={[0, 0.93, 0.352]} material={m.glass} castShadow={false} />
      <Box size={[width - 0.16, 0.03, 0.05]} position={[0, 1.22, 0.37]} material={m.steel} />
      {[-0.18, 0, 0.18].map((x) => (
        <Cylinder key={x} args={[0.02, 0.02, 0.02, 12]} position={[x, 1.31, 0.355]} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      ))}
    </group>
  );
}

/** Induction hob with two pans, sitting on the worktop. */
export function Hob({ width = 0.66, depth = 0.5 }: { width?: number; depth?: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.012, depth]} position={[0, 0.882, 0]} material={m.charcoal} castShadow={false} />
      {[-0.16, 0.16].map((x, index) => (
        <React.Fragment key={x}>
          <Cylinder
            args={[index === 0 ? 0.11 : 0.09, index === 0 ? 0.1 : 0.085, 0.05, 18]}
            position={[x, 0.915, 0]}
            material={index === 0 ? m.steel : m.walnut}
          />
          <Cylinder args={[0.012, 0.012, 0.14, 8]} position={[x + 0.12, 0.93, 0]} material={m.charcoal} rotation={[0, 0, Math.PI / 2]} />
        </React.Fragment>
      ))}
    </group>
  );
}

/** Slim wall extractor above the hob. */
export function ExtractorHood({ width = 0.8, height = 1.95 }: { width?: number; height?: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.12, 0.46]} position={[0, height, 0]} material={m.steel} />
      <Box size={[width - 0.12, 0.05, 0.36]} position={[0, height - 0.07, 0]} material={m.charcoal} castShadow={false} />
      <Box size={[0.28, 0.5, 0.28]} position={[0, height + 0.31, -0.06]} material={m.steel} />
    </group>
  );
}

/** Dishwasher front panel, integrated into a counter run. */
export function Dishwasher({ width = 0.6 }: { width?: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.72, 0.02]} position={[0, 0.4, 0.342]} material={m.steel} />
      <Box size={[width - 0.08, 0.025, 0.05]} position={[0, 0.71, 0.365]} material={m.charcoal} />
      <Box size={[0.03, 0.09, 0.02]} position={[0, 0.15, 0.35]} material={m.charcoal} castShadow={false} />
    </group>
  );
}

/** Front-loading washer, with the drum door visible. */
export function Washer({ width = 0.65, depth = 0.62 }: { width?: number; depth?: number }) {
  const m = getInteriorMaterials();
  const height = 0.86;
  return (
    <group>
      <Box size={[width, height, depth]} position={[0, height / 2, 0]} material={m.porcelain} />
      <Box size={[width - 0.04, 0.06, depth - 0.06]} position={[0, height + 0.03, 0]} material={m.steel} />
      {/* drum door */}
      <mesh position={[0, height * 0.46, depth / 2 + 0.012]} rotation={[Math.PI / 2, 0, 0]} material={m.steel}>
        <cylinderGeometry args={[0.19, 0.19, 0.04, 24]} />
      </mesh>
      <mesh position={[0, height * 0.46, depth / 2 + 0.036]} rotation={[Math.PI / 2, 0, 0]} material={m.glass}>
        <cylinderGeometry args={[0.15, 0.15, 0.02, 24]} />
      </mesh>
      {/* control strip */}
      <Box size={[width - 0.1, 0.09, 0.02]} position={[0, height - 0.1, depth / 2 + 0.008]} material={m.charcoal} castShadow={false} />
      {[-0.16, -0.08, 0.06].map((x) => (
        <Cylinder key={x} args={[0.018, 0.018, 0.016, 12]} position={[x, height - 0.1, depth / 2 + 0.025]} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <Box size={[0.12, 0.05, 0.01]} position={[width / 2 - 0.14, height - 0.1, depth / 2 + 0.022]} material={m.porcelain} castShadow={false} />
      {[
        [-0.22, -0.18],
        [0.22, -0.18],
        [-0.22, 0.18],
        [0.22, 0.18],
      ].map(([x, z], index) => (
        <Cylinder key={index} args={[0.025, 0.025, 0.03, 8]} position={[x!, 0.015, z!]} material={m.charcoal} />
      ))}
    </group>
  );
}

/** Wall-mounted microwave / combi oven. */
export function Microwave({ width = 0.55 }: { width?: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.36, 0.34]} position={[0, 1.62, 0.17]} material={m.steel} />
      <Box size={[width - 0.1, 0.26, 0.02]} position={[-0.03, 1.62, 0.345]} material={m.charcoal} castShadow={false} />
      <Box size={[0.06, 0.26, 0.015]} position={[width / 2 - 0.06, 1.62, 0.35]} material={m.glass} castShadow={false} />
      {[0, 1, 2].map((i) => (
        <Box key={i} size={[0.05, 0.012, 0.01]} position={[-width / 2 + 0.12, 1.73 - i * 0.04, 0.352]} material={m.porcelain} castShadow={false} />
      ))}
    </group>
  );
}

/** Cooker hood + hob + oven + dishwasher, sized from the counter run. */
export function KitchenApplianceSet({ width, depth }: { width: number; depth: number }) {
  const hobWidth = Math.min(0.66, width * 0.3);
  return (
    <group>
      <Hob width={hobWidth} depth={Math.min(0.5, depth * 0.75)} />
      <group position={[0, 0, 0]}>
        <Oven width={Math.min(0.72, width * 0.36)} />
      </group>
      <group position={[width / 2 - Math.min(0.75, width * 0.32), 0, 0]}>
        <ExtractorHood width={Math.min(0.82, width * 0.38)} />
      </group>
      <group position={[-width / 2 + Math.min(0.5, width * 0.22), 0, 0]}>
        <Dishwasher width={Math.min(0.6, width * 0.26)} />
      </group>
      <group position={[width / 2 - Math.min(0.3, width * 0.16), 0, 0]}>
        <Microwave width={Math.min(0.5, width * 0.24)} />
      </group>
    </group>
  );
}
