"use client";

import * as React from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { getFloorPlan } from "@/lib/domain/floorplans";
import type { Property } from "@/lib/domain/types";
import { getMaterials } from "./materials";
import { buildHouseGeometry, disposeHouseGeometry, HOUSE_CONFIG, type HouseGeometrySet } from "./house-geometry";

/**
 * A selectable condominium unit. All static geometry is merged per material
 * (see house-geometry.ts); the only per-frame work is the selection ring.
 */

export interface HouseExteriorProps {
  property: Property;
  position: { x: number; z: number };
  rotationY: number;
  selected: boolean;
  hovered: boolean;
  ghosted?: boolean;
  lowQuality?: boolean;
  /** Night renders lit glazing and a warm porch light. */
  night?: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

function SelectionRing({ radius, selected, hovered }: { radius: number; selected: boolean; hovered: boolean }) {
  const ring = React.useRef<THREE.Mesh>(null);
  const material = React.useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#e8c894",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  React.useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = clock.getElapsedTime();
    material.opacity = selected ? 0.62 + Math.sin(t * 2) * 0.18 : hovered ? 0.42 : 0;
    ring.current.scale.setScalar(selected ? 1 + Math.sin(t * 2) * 0.012 : 1);
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.13, 0]} material={material} renderOrder={2}>
      <ringGeometry args={[radius - 0.18, radius, 80]} />
    </mesh>
  );
}

export function HouseExterior({
  property,
  position,
  rotationY,
  selected,
  hovered,
  ghosted = false,
  lowQuality = false,
  night = false,
  onSelect,
  onHover,
}: HouseExteriorProps) {
  const materials = getMaterials();
  const plan = React.useMemo(() => getFloorPlan(property.typology), [property.typology]);
  const config = HOUSE_CONFIG[property.typology]!;
  const seed = React.useMemo(() => Number(property.code.replace(/\D/g, "")) || 1, [property.code]);
  const geometry: HouseGeometrySet = React.useMemo(
    () => buildHouseGeometry(plan, config, seed),
    [plan, config, seed],
  );

  React.useEffect(() => {
    return () => disposeHouseGeometry(geometry);
  }, [geometry]);

  const radius = Math.max(plan.widthM, plan.depthM) / 2 + 2.0;

  if (ghosted) {
    return (
      <group position={[position.x, 0, position.z]} rotation={[0, (rotationY * Math.PI) / 180, 0]}>
        <mesh position={[0, 1.1, 0]} material={materials.concrete} castShadow={false}>
          <boxGeometry args={[plan.widthM * 0.94, 2.2, plan.depthM * 0.94]} />
        </mesh>
      </group>
    );
  }

  const meshFor = (key: keyof HouseGeometrySet, material: THREE.Material, shadow = true) => {
    const geo = geometry[key];
    if (!geo) return null;
    return <mesh geometry={geo} material={material} castShadow={shadow} receiveShadow />;
  };

  return (
    <group
      position={[position.x, 0, position.z]}
      rotation={[0, (rotationY * Math.PI) / 180, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(property.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover?.(property.id);
      }}
      onPointerOut={() => onHover?.(null)}
    >
      <SelectionRing radius={radius} selected={selected} hovered={hovered} />
      {meshFor("stone", materials.stone)}
      {meshFor("render", materials.render)}
      {meshFor("charcoal", materials.charcoal)}
      {meshFor("metal", materials.metal)}
      {meshFor("timber", materials.timber)}
      {meshFor("timberDark", materials.timberDark)}
      {meshFor("concrete", materials.concrete)}
      {meshFor("deck", materials.deck)}
      {meshFor("gravel", materials.gravel)}
      {/* Vegetation is no longer part of the house mesh: garden planting belongs
          to the plot (lib/3d/parts.ts), where it is bounded by the plot walls. */}
      {meshFor("glass", night ? materials.glassNight : materials.glass, false)}
      {meshFor("glassRail", materials.glassRail, false)}
      {selected && (
        <Html position={[0, config.groundH + config.upperH + 2.2, 0]} center distanceFactor={30} zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full border border-white/15 bg-obsidian/85 px-3 py-1 text-[11px] font-medium tracking-wide text-porcelain shadow-lg backdrop-blur">
            {property.code} · {property.typology}
          </div>
        </Html>
      )}
      {night && !lowQuality && (
        <pointLight position={[0, 2.1, plan.depthM / 2 + 0.8]} intensity={2.4} distance={7} decay={2} color="#ffc182" />
      )}
      {selected && !lowQuality && (
        <pointLight position={[0, 2.2, plan.depthM / 2]} intensity={night ? 3.2 : 8} distance={14} color="#ffd9a0" />
      )}
    </group>
  );
}
