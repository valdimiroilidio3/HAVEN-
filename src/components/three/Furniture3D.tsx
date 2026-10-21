"use client";

import * as React from "react";
import * as THREE from "three";
import type { FurniturePiece } from "@/lib/domain/floorplans";
import { getInteriorMaterials } from "./materials";

/**
 * Furniture prototype built from simple, well-proportioned primitives.
 * Deliberately lightweight: an interior scene renders ~30 pieces, and each
 * piece uses as few meshes as is visually convincing.
 */

function Box({
  size,
  position,
  material,
  rotation,
  castShadow = true,
}: {
  size: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  rotation?: [number, number, number];
  castShadow?: boolean;
}) {
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
    <mesh position={position} rotation={rotation} material={material} castShadow receiveShadow>
      <cylinderGeometry args={args} />
    </mesh>
  );
}

const DEG = Math.PI / 180;

function Sofa({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  const seatH = 0.42;
  return (
    <group>
      <Box size={[width, 0.3, depth]} position={[0, 0.15, 0]} material={m.boucle} />
      <Box size={[width - 0.36, 0.16, depth - 0.3]} position={[0, seatH, 0.08]} material={m.linen} />
      <Box size={[width, 0.62, 0.24]} position={[0, 0.62, -depth / 2 + 0.12]} material={m.boucle} />
      <Box size={[0.22, 0.5, depth]} position={[-width / 2 + 0.11, 0.4, 0]} material={m.boucle} />
      <Box size={[0.22, 0.5, depth]} position={[width / 2 - 0.11, 0.4, 0]} material={m.boucle} />
      <Box size={[0.32, 0.34, 0.14]} position={[-width / 2 + 0.5, 0.66, -depth / 2 + 0.38]} material={m.linen} rotation={[0.1, 0, 0.05]} />
      <Box size={[0.32, 0.34, 0.14]} position={[width / 2 - 1.0, 0.66, -depth / 2 + 0.38]} material={m.charcoal} rotation={[0.1, 0, -0.06]} />
      {[-1, 1].map((s) => (
        <Cylinder key={s} args={[0.026, 0.026, 0.12, 8]} position={[(s * (width - 0.3)) / 2, 0.06, (s * (depth - 0.24)) / 2]} material={m.walnut} />
      ))}
    </group>
  );
}

function Armchair({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.32, depth]} position={[0, 0.24, 0]} material={m.boucle} />
      <Box size={[width - 0.16, 0.12, depth - 0.16]} position={[0, 0.44, 0.02]} material={m.linen} />
      <Box size={[width, 0.56, 0.16]} position={[0, 0.62, -depth / 2 + 0.08]} material={m.boucle} rotation={[-0.08, 0, 0]} />
      <Box size={[0.1, 0.42, depth]} position={[-width / 2 + 0.05, 0.46, 0]} material={m.walnut} />
      <Box size={[0.1, 0.42, depth]} position={[width / 2 - 0.05, 0.46, 0]} material={m.walnut} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.05, 0.28, 0.05]} position={[(s * (width - 0.2)) / 2, 0.08, depth / 2 - 0.12]} material={m.walnut} />
      ))}
    </group>
  );
}

function Table({ width, depth, height, material }: { width: number; depth: number; height: number; material: THREE.Material }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.055, depth]} position={[0, height, 0]} material={material} />
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <Cylinder
          key={i}
          args={[0.028, 0.028, height, 8]}
          position={[(sx! * (width - 0.16)) / 2, height / 2, (sz! * (depth - 0.16)) / 2]}
          material={m.walnut}
        />
      ))}
    </group>
  );
}

function DiningChairs({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  const positions: Array<[number, number, number]> = [];
  for (let i = 0; i < 3; i++) {
    positions.push([-width / 2 + (width / 3) * (i + 0.5), -depth / 2 - 0.32, 0]);
    positions.push([-width / 2 + (width / 3) * (i + 0.5), depth / 2 + 0.32, Math.PI]);
  }
  return (
    <group>
      {positions.map(([x, z, rot], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, rot, 0]}>
          <Box size={[0.44, 0.05, 0.44]} position={[0, 0.45, 0]} material={m.oak} />
          <Box size={[0.44, 0.42, 0.05]} position={[0, 0.68, -0.2]} material={m.oak} />
          {[
            [-0.18, -0.18],
            [0.18, -0.18],
            [-0.18, 0.18],
            [0.18, 0.18],
          ].map(([sx, sz], j) => (
            <Box key={j} size={[0.035, 0.45, 0.035]} position={[sx!, 0.225, sz!]} material={m.walnut} />
          ))}
        </group>
      ))}
    </group>
  );
}

function KitchenRun({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.82, depth]} position={[0, 0.41, 0]} material={m.oak} />
      <Box size={[width + 0.04, 0.05, depth + 0.04]} position={[0, 0.86, 0]} material={m.marble} />
      <Box size={[width, 0.72, depth * 0.62]} position={[0, 1.85, -depth * 0.19]} material={m.oak} />
      <Box size={[width, 0.34, 0.02]} position={[0, 1.32, depth / 2]} material={m.marble} />
      {/* sink */}
      <Box size={[Math.min(0.62, width * 0.3), 0.02, depth * 0.62]} position={[-width * 0.24, 0.875, 0.02]} material={m.steel} />
      <Cylinder args={[0.018, 0.018, 0.32, 8]} position={[-width * 0.24, 1.02, -depth * 0.18]} material={m.steel} />
      <Box size={[0.2, 0.02, 0.02]} position={[-width * 0.24, 1.17, -depth * 0.1]} material={m.steel} />
      {/* hob */}
      <Box size={[Math.min(0.6, width * 0.3), 0.012, depth * 0.6]} position={[width * 0.22, 0.875, 0.02]} material={m.charcoal} />
      {/* handles */}
      {Array.from({ length: Math.max(2, Math.round(width / 0.7)) }, (_, i) => {
        const handles = Math.max(2, Math.round(width / 0.7));
        return (
          <Box
            key={i}
            size={[0.02, 0.02, 0.12]}
            position={[-width / 2 + (width / handles) * (i + 0.5), 0.72, depth / 2 + 0.01]}
            material={m.steel}
            castShadow={false}
          />
        );
      })}
    </group>
  );
}

function KitchenIsland({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.86, depth]} position={[0, 0.43, 0]} material={m.oak} />
      <Box size={[width + 0.08, 0.06, depth + 0.08]} position={[0, 0.89, 0]} material={m.marble} />
      <Box size={[width * 0.4, 0.015, depth * 0.55]} position={[-width * 0.2, 0.925, 0]} material={m.steel} />
      <Cylinder args={[0.02, 0.02, 0.3, 8]} position={[-width * 0.2, 1.04, -depth * 0.25]} material={m.steel} />
      {/* stools */}
      {[-width * 0.28, 0, width * 0.28].map((x, i) => (
        <group key={i} position={[x, 0, depth / 2 + 0.34]}>
          <Cylinder args={[0.17, 0.17, 0.05, 16]} position={[0, 0.64, 0]} material={m.oak} />
          {[
            [-0.1, -0.1],
            [0.1, -0.1],
            [-0.1, 0.1],
            [0.1, 0.1],
          ].map(([sx, sz], j) => (
            <Cylinder key={j} args={[0.016, 0.02, 0.64, 6]} position={[sx!, 0.32, sz!]} material={m.steel} />
          ))}
        </group>
      ))}
    </group>
  );
}

function Bed({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  const base = 0.32;
  return (
    <group>
      <Box size={[width + 0.12, base, depth + 0.08]} position={[0, base / 2, 0]} material={m.oak} />
      <Box size={[width, 0.26, depth]} position={[0, base + 0.13, 0]} material={m.duvet} />
      <Box size={[width + 0.16, 0.95, 0.1]} position={[0, 0.62, -depth / 2 - 0.06]} material={m.walnut} />
      <Box size={[width - 0.06, 0.12, depth * 0.55]} position={[0, base + 0.3, depth * 0.16]} material={m.linen} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[width * 0.42, 0.14, 0.42]} position={[s * width * 0.23, base + 0.3, -depth / 2 + 0.34]} material={m.porcelain} rotation={[0.06, 0, 0]} />
      ))}
      <Box size={[width + 0.1, 0.05, 0.5]} position={[0, base + 0.27, depth * 0.34]} material={m.charcoal} />
    </group>
  );
}

function Wardrobe({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  const doors = Math.max(2, Math.round(width / 0.65));
  return (
    <group>
      <Box size={[width, 2.4, depth]} position={[0, 1.2, 0]} material={m.oak} />
      {Array.from({ length: doors - 1 }, (_, i) => (
        <Box key={i} size={[0.012, 2.34, 0.01]} position={[-width / 2 + (width / doors) * (i + 1), 1.2, depth / 2 + 0.006]} material={m.walnut} castShadow={false} />
      ))}
      <Box size={[0.02, 0.24, 0.02]} position={[0, 1.2, depth / 2 + 0.03]} material={m.steel} castShadow={false} />
    </group>
  );
}

function Bathtub({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.56, depth]} position={[0, 0.28, 0]} material={m.porcelain} />
      <Box size={[width - 0.16, 0.4, depth - 0.16]} position={[0, 0.42, 0]} material={m.tile} />
      <Box size={[width - 0.2, 0.04, depth - 0.2]} position={[0, 0.2, 0]} material={m.porcelain} />
      <Cylinder args={[0.018, 0.018, 0.24, 8]} position={[width / 2 - 0.1, 0.68, 0]} material={m.steel} />
      <Box size={[0.16, 0.02, 0.02]} position={[width / 2 - 0.18, 0.8, 0]} material={m.steel} />
    </group>
  );
}

function Shower({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.05, depth]} position={[0, 0.025, 0]} material={m.porcelain} />
      <Box size={[width, 2.0, 0.012]} position={[0, 1.0, -depth / 2]} material={m.glass} castShadow={false} />
      <Box size={[0.012, 2.0, depth]} position={[width / 2, 1.0, 0]} material={m.glass} castShadow={false} />
      <Cylinder args={[0.012, 0.012, 0.22, 8]} position={[-width / 2 + 0.12, 2.05, -depth / 2 + 0.12]} material={m.steel} />
      <Cylinder args={[0.07, 0.07, 0.02, 12]} position={[-width / 2 + 0.22, 2.02, -depth / 2 + 0.2]} material={m.steel} rotation={[0.3, 0, 0]} />
    </group>
  );
}

function Toilet() {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[0.22, 0.7, 0.44]} position={[0, 0.35, -0.22]} material={m.porcelain} />
      <Cylinder args={[0.2, 0.16, 0.38, 18]} position={[0, 0.19, 0.06]} material={m.porcelain} />
      <Box size={[0.38, 0.045, 0.5]} position={[0, 0.405, 0.05]} material={m.porcelain} />
    </group>
  );
}

function Vanity({ width }: { width: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.78, 0.48]} position={[0, 0.39, 0]} material={m.oak} />
      <Box size={[width + 0.04, 0.05, 0.52]} position={[0, 0.8, 0]} material={m.marble} />
      <Cylinder args={[0.16, 0.13, 0.11, 20]} position={[0, 0.88, 0.02]} material={m.porcelain} />
      <Cylinder args={[0.014, 0.014, 0.22, 8]} position={[0, 0.98, -0.16]} material={m.steel} />
      <Box size={[width * 0.8, 0.9, 0.03]} position={[0, 1.45, -0.245]} material={m.mirror} castShadow={false} />
    </group>
  );
}

function Shelf({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  const levels = 4;
  return (
    <group>
      <Box size={[0.04, 2.0, depth]} position={[-width / 2, 1.0, 0]} material={m.oak} />
      <Box size={[0.04, 2.0, depth]} position={[width / 2, 1.0, 0]} material={m.oak} />
      {Array.from({ length: levels }, (_, i) => (
        <Box key={i} size={[width, 0.04, depth]} position={[0, 0.35 + i * 0.5, 0]} material={m.oak} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <Box
          key={`b${i}`}
          size={[0.06, 0.22 + (i % 3) * 0.04, 0.18]}
          position={[-width / 2 + 0.2 + (i % 5) * 0.16, 0.47 + Math.floor(i / 5) * 0.5, 0]}
          material={i % 2 ? m.charcoal : m.linen}
          castShadow={false}
        />
      ))}
    </group>
  );
}

function Plant({ scale = 1 }: { scale?: number }) {
  const m = getInteriorMaterials();
  return (
    <group scale={scale}>
      <Cylinder args={[0.16, 0.12, 0.32, 12]} position={[0, 0.16, 0]} material={m.ceramic} />
      <Cylinder args={[0.025, 0.03, 1.0, 6]} position={[0, 0.8, 0]} material={m.walnut} />
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 0.24, 1.05 + (i % 3) * 0.15, Math.sin(angle) * 0.24]}
            material={m.plant}
            scale={[0.3, 0.18, 0.3]}
            castShadow
          >
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Washer() {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[0.62, 0.85, 0.6]} position={[0, 0.425, 0]} material={m.porcelain} />
      <Cylinder args={[0.2, 0.2, 0.02, 20]} position={[0, 0.48, 0.31]} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      <Box size={[0.56, 0.08, 0.02]} position={[0, 0.8, 0.3]} material={m.charcoal} castShadow={false} />
    </group>
  );
}

function Desk({ width, depth }: { width: number; depth: number }) {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[width, 0.05, depth]} position={[0, 0.74, 0]} material={m.oak} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.05, 0.74, depth - 0.06]} position={[(s * (width - 0.08)) / 2, 0.37, 0]} material={m.walnut} />
      ))}
      <Box size={[0.52, 0.32, 0.02]} position={[0, 0.95, -depth / 2 + 0.12]} material={m.charcoal} />
      <Cylinder args={[0.02, 0.02, 0.18, 8]} position={[0, 0.82, -depth / 2 + 0.12]} material={m.steel} />
      <group position={[0, 0, depth / 2 + 0.35]}>
        <Cylinder args={[0.22, 0.22, 0.06, 16]} position={[0, 0.45, 0]} material={m.charcoal} />
        <Cylinder args={[0.03, 0.03, 0.42, 8]} position={[0, 0.22, 0]} material={m.steel} />
        <Cylinder args={[0.2, 0.2, 0.04, 12]} position={[0, 0.02, 0]} material={m.steel} />
      </group>
    </group>
  );
}

function FloorLamp() {
  const m = getInteriorMaterials();
  return (
    <group>
      <Cylinder args={[0.16, 0.18, 0.03, 16]} position={[0, 0.015, 0]} material={m.charcoal} />
      <Cylinder args={[0.012, 0.012, 1.5, 8]} position={[0, 0.75, 0]} material={m.steel} />
      <mesh position={[0, 1.56, 0]} material={m.linen} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.26, 16, 1, true]} />
      </mesh>
      <pointLight position={[0, 1.5, 0]} intensity={2.2} distance={4} color="#ffd9a0" />
    </group>
  );
}

function Pouf({ width }: { width: number }) {
  const m = getInteriorMaterials();
  return <Cylinder args={[width / 2, width / 2, 0.38, 20]} position={[0, 0.19, 0]} material={m.boucle} />;
}

function Nightstand() {
  const m = getInteriorMaterials();
  return (
    <group>
      <Box size={[0.44, 0.46, 0.4]} position={[0, 0.23, 0]} material={m.oak} />
      <Box size={[0.36, 0.01, 0.01]} position={[0, 0.28, 0.21]} material={m.walnut} castShadow={false} />
      <Cylinder args={[0.07, 0.09, 0.16, 12]} position={[0, 0.56, 0]} material={m.ceramic} />
      <mesh position={[0, 0.7, 0]} material={m.linen}>
        <cylinderGeometry args={[0.01, 0.09, 0.12, 12, 1, true]} />
      </mesh>
    </group>
  );
}

export function Furniture3D({ piece }: { piece: FurniturePiece }) {
  const m = getInteriorMaterials();
  const { width, depth } = piece;
  const content = (() => {
    switch (piece.type) {
      case "sofa":
      case "sectional":
        return <Sofa width={width} depth={depth} />;
      case "armchair":
        return <Armchair width={width} depth={depth} />;
      case "coffeeTable":
        return <Table width={width} depth={depth} height={0.42} material={m.marble} />;
      case "diningTable":
      case "outdoorTable":
        return <Table width={width} depth={depth} height={0.74} material={m.oak} />;
      case "diningChairs":
        return <DiningChairs width={width} depth={depth} />;
      case "kitchenRun":
        return <KitchenRun width={width} depth={depth} />;
      case "kitchenIsland":
        return <KitchenIsland width={width} depth={depth} />;
      case "kitchenTower":
        return <Wardrobe width={width} depth={depth} />;
      case "bed":
        return <Bed width={width} depth={depth} />;
      case "nightstand":
        return <Nightstand />;
      case "wardrobe":
        return <Wardrobe width={width} depth={depth} />;
      case "desk":
        return <Desk width={width} depth={depth} />;
      case "dresser":
        return (
          <group>
            <Box size={[width, 0.8, depth]} position={[0, 0.4, 0]} material={m.oak} />
            {[0.25, 0.5, 0.68].map((y, i) => (
              <Box key={i} size={[width * 0.8, 0.01, 0.01]} position={[0, y, depth / 2 + 0.005]} material={m.walnut} castShadow={false} />
            ))}
          </group>
        );
      case "bathtub":
        return <Bathtub width={width} depth={depth} />;
      case "shower":
        return <Shower width={width} depth={depth} />;
      case "toilet":
        return <Toilet />;
      case "vanity":
        return <Vanity width={width} />;
      case "washer":
        return <Washer />;
      case "shelf":
        return <Shelf width={width} depth={depth} />;
      case "plant":
        return <Plant scale={width / 0.55} />;
      case "floorLamp":
        return <FloorLamp />;
      case "bench":
        return (
          <group>
            <Box size={[width, 0.08, depth]} position={[0, 0.44, 0]} material={m.oak} />
            {[-1, 1].map((s) => (
              <Box key={s} size={[0.06, 0.44, depth - 0.04]} position={[(s * (width - 0.12)) / 2, 0.22, 0]} material={m.walnut} />
            ))}
          </group>
        );
      case "sideboard":
        return <Box size={[width, 0.8, depth]} position={[0, 0.4, 0]} material={m.oak} />;
      case "rug":
        return <Box size={[width, 0.012, depth]} position={[0, 0.012, 0]} material={m.rug} castShadow={false} />;
      case "tvConsole":
        return (
          <group>
            <Box size={[width, 0.42, depth]} position={[0, 0.21, 0]} material={m.charcoal} />
            <Box size={[width * 0.86, width * 0.5, 0.03]} position={[0, 1.1, -0.06]} material={m.charcoal} />
            <Box size={[width * 0.88, width * 0.52, 0.02]} position={[0, 1.1, -0.075]} material={m.glass} castShadow={false} />
          </group>
        );
      case "lounger":
        return (
          <group>
            <Box size={[width, 0.09, depth * 0.62]} position={[0, 0.34, depth * 0.19]} material={m.linen} />
            <Box size={[width, 0.09, depth * 0.42]} position={[0, 0.52, -depth * 0.26]} material={m.linen} rotation={[-0.5, 0, 0]} />
            {[-1, 1].map((s) => (
              <Box key={s} size={[0.05, 0.3, depth * 0.6]} position={[(s * (width - 0.1)) / 2, 0.18, depth * 0.2]} material={m.walnut} />
            ))}
          </group>
        );
      default:
        return <Pouf width={Math.min(width, depth)} />;
    }
  })();

  return (
    <group position={[piece.x, 0, piece.z]} rotation={[0, (piece.rotation * DEG), 0]}>
      {content}
    </group>
  );
}
