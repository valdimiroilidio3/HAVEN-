"use client";

import * as React from "react";
import * as THREE from "three";
import { SITE } from "@/lib/3d/site";
import { getMaterials } from "../materials";

/**
 * The perimeter wall and the entrance gate.
 *
 * Positioned from `SITE.fence` and `SITE.gate`, so the fence the validator
 * checks is the fence the player sees.
 */

export function Boundary() {
  const m = getMaterials();
  const { minX, maxX, minZ, maxZ } = SITE.fence;
  const gateHalf = 3.6;
  const walls = [
    { x: 0, z: minZ, w: maxX - minX, d: 0.5 },
    { x: minX, z: (minZ + maxZ) / 2, w: 0.5, d: maxZ - minZ },
    { x: maxX, z: (minZ + maxZ) / 2, w: 0.5, d: maxZ - minZ },
    { x: (minX + SITE.gate.x - gateHalf) / 2, z: maxZ, w: SITE.gate.x - gateHalf - minX, d: 0.5 },
    { x: (maxX + SITE.gate.x + gateHalf) / 2, z: maxZ, w: maxX - (SITE.gate.x + gateHalf), d: 0.5 },
  ];
  return (
    <group>
      {walls.map((wall, i) => (
        <group key={i}>
          <mesh position={[wall.x, 0.6, wall.z]} material={m.render} castShadow receiveShadow>
            <boxGeometry args={[wall.w, 1.2, wall.d]} />
          </mesh>
          <mesh position={[wall.x, 1.24, wall.z]} material={m.stone} castShadow>
            <boxGeometry args={[wall.w + 0.12, 0.1, wall.d + 0.12]} />
          </mesh>
        </group>
      ))}
      {/* gate */}
      <group position={[SITE.gate.x, 0, SITE.gate.z]}>
        {[-3.1, 3.1].map((x) => (
          <mesh key={x} position={[x, 1.6, 0]} material={m.stone} castShadow receiveShadow>
            <boxGeometry args={[0.9, 3.2, 0.9]} />
          </mesh>
        ))}
        <mesh position={[0, 3.35, 0]} material={m.charcoal} castShadow>
          <boxGeometry args={[7.1, 0.3, 0.6]} />
        </mesh>
        <GateSign />
      </group>
    </group>
  );
}

function GateSign() {
  const texture = React.useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = "#efece2";
    ctx.font = "600 130px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "18px";
    ctx.fillText("HAVEN", 512, 138);
    ctx.font = "400 34px Inter, sans-serif";
    ctx.fillStyle = "#c7a77a";
    ctx.fillText("VALE DO SOBREIRO", 512, 216);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);
  React.useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <mesh position={[0, 3.32, -0.32]} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[5.4, 1.35]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}
