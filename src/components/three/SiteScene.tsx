"use client";

import * as React from "react";
import * as THREE from "three";
import { Environment, Lightformer, Sky, Stars } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { getMaterials } from "./materials";
import { HouseExterior } from "./HouseExterior";
import { buildCanopies, canopyTint, POOL_COLORS } from "./vegetation";
import {
  drivewayFor,
  garageFor,
  garagePlan,
  lampPositions,
  plotRearDepth,
  plotWallsFor,
  poolFor,
  poolKeepOut,
  scatterShrubs,
  scatterTrees,
  SITE,
  type GarageSpec,
  type PoolSpec,
  type TreeKind,
} from "@/lib/3d/site";
import type { Property } from "@/lib/domain/types";
import type { HouseConfig } from "./house-geometry";

export interface SceneEntry {
  property: Property;
  position: { x: number; z: number };
  rotationY: number;
}

/* ── Roads ────────────────────────────────────────────────────────────── */

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

function Roads() {
  const m = getMaterials();
  const ringGeometry = React.useMemo(() => {
    const outer = SITE.ring.outer;
    const inner = SITE.ring.inner;
    const shape = new THREE.Shape();
    roundedRectPath(shape, outer.maxX - outer.minX, outer.maxZ - outer.minZ, outer.radius, (outer.minX + outer.maxX) / 2, (outer.minZ + outer.maxZ) / 2);
    const hole = new THREE.Path();
    roundedRectPath(hole, inner.maxX - inner.minX, inner.maxZ - inner.minZ, inner.radius, (inner.minX + inner.maxX) / 2, (inner.minZ + inner.maxZ) / 2, true);
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape, 16);
  }, []);
  React.useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);

  return (
    <group>
      <mesh geometry={ringGeometry} material={m.asphalt} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} receiveShadow />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(SITE.entrance.minX + SITE.entrance.maxX) / 2, 0.045, (SITE.entrance.minZ + SITE.entrance.maxZ) / 2]}
        material={m.asphalt}
        receiveShadow
      >
        <planeGeometry args={[SITE.entrance.maxX - SITE.entrance.minX, SITE.entrance.maxZ - SITE.entrance.minZ]} />
      </mesh>
      {/* central plaza + garden paths */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[SITE.centralPlaza.x, 0.05, SITE.centralPlaza.z]} material={m.gravel} receiveShadow>
        <circleGeometry args={[SITE.centralPlaza.radius, 48]} />
      </mesh>
      {[
        { x: 0, z: (SITE.ring.inner.minZ + SITE.centralPlaza.z - SITE.centralPlaza.radius) / 2 - 0.2, w: 2.2, d: Math.abs(SITE.ring.inner.minZ - (SITE.centralPlaza.z - SITE.centralPlaza.radius)) + 0.4 },
        { x: 0, z: (SITE.ring.inner.maxZ + SITE.centralPlaza.z + SITE.centralPlaza.radius) / 2, w: 2.2, d: Math.abs(SITE.ring.inner.maxZ - (SITE.centralPlaza.z + SITE.centralPlaza.radius)) + 0.4 },
        { x: (SITE.ring.inner.minX + SITE.centralPlaza.x - SITE.centralPlaza.radius) / 2, z: SITE.centralPlaza.z, w: Math.abs(SITE.ring.inner.minX - (SITE.centralPlaza.x - SITE.centralPlaza.radius)) + 0.4, d: 2.2 },
        { x: (SITE.ring.inner.maxX + SITE.centralPlaza.x + SITE.centralPlaza.radius) / 2, z: SITE.centralPlaza.z, w: Math.abs(SITE.ring.inner.maxX - (SITE.centralPlaza.x + SITE.centralPlaza.radius)) + 0.4, d: 2.2 },
      ].map((path, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[path.x, 0.052, path.z]} material={m.gravel} receiveShadow>
          <planeGeometry args={[Math.max(path.w, 0.5), Math.max(path.d, 0.5)]} />
        </mesh>
      ))}
    </group>
  );
}

function Driveways({ entries, plots }: { entries: SceneEntry[]; plots: Array<{ garage: GarageSpec | null }> }) {
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

/* ── Landscape ────────────────────────────────────────────────────────── */

function Trees({
  entries,
  plots,
  lowQuality,
  night,
}: {
  entries: SceneEntry[];
  plots: Array<{ pool: PoolSpec | null; rearDepth: number }>;
  lowQuality: boolean;
  night: boolean;
}) {
  const m = getMaterials();
  const trunks = React.useRef<THREE.InstancedMesh>(null);
  const canopyRefs = React.useRef<Record<string, THREE.InstancedMesh | null>>({});

  const trees = React.useMemo(() => {
    const keepOut = entries.flatMap((entry, index) => {
      const pool = plots[index]?.pool;
      return pool ? [poolKeepOut(pool, entry.position, entry.rotationY)] : [];
    });
    return scatterTrees({
      houses: entries.map((e) => ({ position: e.position, typology: e.property.typology, rotationY: e.rotationY })),
      count: lowQuality ? 55 : 120,
      seed: 20261021,
      keepOut,
    });
  }, [entries, plots, lowQuality]);

  const canopies = React.useMemo(() => buildCanopies(), []);
  React.useEffect(
    () => () => {
      for (const build of Object.values(canopies)) build.geometry.dispose();
    },
    [canopies],
  );

  const counts = React.useMemo(() => {
    const result: Record<TreeKind, number> = { broadleaf: 0, conifer: 0, poplar: 0, olive: 0 };
    for (const tree of trees) result[tree.kind] += 1;
    return result;
  }, [trees]);

  React.useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const cursor: Record<TreeKind, number> = { broadleaf: 0, conifer: 0, poplar: 0, olive: 0 };

    trees.forEach((tree, index) => {
      const build = canopies[tree.kind];
      const trunkScale = build.trunk;
      const s = tree.scale;
      quaternion.setFromAxisAngle(axis, tree.rotation);

      position.set(tree.x, 1.15 * s * trunkScale, tree.z);
      scale.set(s * (tree.kind === "conifer" ? 0.9 : 1), s * trunkScale, s * (tree.kind === "conifer" ? 0.9 : 1));
      matrix.compose(position, quaternion, scale);
      trunks.current?.setMatrixAt(index, matrix);

      const mesh = canopyRefs.current[tree.kind];
      if (mesh) {
        const k = cursor[tree.kind];
        position.set(tree.x, (2.05 + build.lift) * s * trunkScale, tree.z);
        const spread = build.radius * s;
        scale.set(spread, spread * (tree.kind === "poplar" ? 1.24 : tree.kind === "olive" ? 0.92 : 1), spread);
        quaternion.setFromAxisAngle(axis, tree.rotation + (index % 5) * 0.7);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(k, matrix);
        mesh.setColorAt(k, canopyTint(tree.kind, s + index * 0.017, night));
        cursor[tree.kind] = k + 1;
      }
    });

    if (trunks.current) {
      trunks.current.count = trees.length;
      trunks.current.instanceMatrix.needsUpdate = true;
      trunks.current.computeBoundingSphere();
    }
    for (const kind of Object.keys(canopyRefs.current) as TreeKind[]) {
      const mesh = canopyRefs.current[kind];
      if (!mesh) continue;
      mesh.count = cursor[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [trees, canopies, night]);

  const trunkGeometry = React.useMemo(() => new THREE.CylinderGeometry(0.11, 0.2, 2.3, 7), []);
  React.useEffect(() => () => trunkGeometry.dispose(), [trunkGeometry]);

  return (
    <group>
      <instancedMesh ref={trunks} args={[trunkGeometry, m.trunk, Math.max(1, trees.length)]} castShadow receiveShadow frustumCulled={false} />
      {(Object.keys(canopies) as TreeKind[]).map((kind, index) => (
        <instancedMesh
          key={kind}
          ref={(node) => {
            canopyRefs.current[kind] = node;
          }}
          args={[canopies[kind].geometry, m.foliage[index % m.foliage.length]!, Math.max(1, counts[kind])]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

function Shrubs({ entries, lowQuality }: { entries: SceneEntry[]; lowQuality: boolean }) {
  const m = getMaterials();
  const ref = React.useRef<THREE.InstancedMesh>(null);
  const shrubs = React.useMemo(
    () =>
      scatterShrubs(
        entries.map((e) => ({ position: e.position, typology: e.property.typology, rotationY: e.rotationY })),
        913,
      ).slice(0, lowQuality ? 30 : 70),
    [entries, lowQuality],
  );
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    shrubs.forEach((shrub, index) => {
      matrix.compose(
        new THREE.Vector3(shrub.x, 0.28 * shrub.scale, shrub.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shrub.rotation),
        new THREE.Vector3(shrub.scale * 3.4, shrub.scale * 2.2, shrub.scale * 3.4),
      );
      ref.current!.setMatrixAt(index, matrix);
      ref.current!.setColorAt(index, canopyTint(shrub.kind, 0.4 + index * 0.031));
    });
    ref.current.count = shrubs.length;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [shrubs]);
  const geometry = React.useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  React.useEffect(() => () => geometry.dispose(), [geometry]);
  return <instancedMesh ref={ref} args={[geometry, m.hedge, Math.max(1, shrubs.length)]} castShadow receiveShadow frustumCulled={false} />;
}

/* ── Private plots: walls and pools ───────────────────────────────────── */

function PlotBoundary({ typology, rearDepth }: { typology: SceneEntry["property"]["typology"]; rearDepth: number }) {
  const m = getMaterials();
  const walls = React.useMemo(() => plotWallsFor(typology, rearDepth), [typology, rearDepth]);
  return (
    <group>
      {walls.map((wall, index) => (
        <group key={index} position={[wall.x, 0, wall.z]}>
          <mesh position={[0, wall.height / 2, 0]} material={m.render} castShadow receiveShadow>
            <boxGeometry args={[wall.width, wall.height, wall.depth]} />
          </mesh>
          <mesh position={[0, wall.height + 0.045, 0]} material={m.stone} castShadow>
            <boxGeometry args={[wall.width + 0.14, 0.09, wall.depth + 0.14]} />
          </mesh>
          {/* piers at the rear corners give the wall a built, not extruded, read */}
          {index < 2 && (
            <mesh position={[0, (wall.height + 0.3) / 2, wall.depth / 2 - 0.25]} material={m.stone} castShadow>
              <boxGeometry args={[wall.width + 0.3, wall.height + 0.3, 0.5]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/* ── Cars and parking ─────────────────────────────────────────────────── */

function Car({ x, paint, scale = 1 }: { x: number; paint: THREE.Material; scale?: number }) {
  const m = getMaterials();
  return (
    <group position={[x, 0, 0]} scale={[1, 1, scale]}>
      {/* sills and body */}
      <mesh position={[0, 0.46, 0]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[1.76, 0.36, 3.95]} />
      </mesh>
      <mesh position={[0, 0.74, -0.06]} material={paint} castShadow>
        <boxGeometry args={[1.7, 0.34, 3.45]} />
      </mesh>
      {/* glazed cabin with a painted roof */}
      <mesh position={[0, 1.02, -0.2]} material={m.carGlass} castShadow>
        <boxGeometry args={[1.58, 0.44, 2.15]} />
      </mesh>
      <mesh position={[0, 1.24, -0.2]} material={paint} castShadow>
        <boxGeometry args={[1.5, 0.1, 1.95]} />
      </mesh>
      {[[-0.8, 1.28], [0.8, 1.28], [-0.8, -1.32], [0.8, -1.32]].map(([wx, wz], index) => (
        <mesh
          key={index}
          position={[wx!, 0.33, wz!]}
          rotation={[0, 0, Math.PI / 2]}
          material={m.charcoal}
          castShadow
        >
          <cylinderGeometry args={[0.33, 0.33, 0.22, 14]} />
        </mesh>
      ))}
      {/* headlights */}
      <mesh position={[-0.56, 0.7, 1.98]} material={m.white}>
        <boxGeometry args={[0.46, 0.12, 0.05]} />
      </mesh>
      <mesh position={[0.56, 0.7, 1.98]} material={m.white}>
        <boxGeometry args={[0.46, 0.12, 0.05]} />
      </mesh>
    </group>
  );
}

/**
 * Garage / carport in the front garden, sized by the space actually available
 * before the road. Bigger homes get walled bays with a rolled-up sectional
 * door; smaller ones a timber carport. Cars are always visible.
 */
function Garage({ spec, seed, night, lowQuality }: { spec: GarageSpec; seed: number; night: boolean; lowQuality: boolean }) {
  const m = getMaterials();
  const first = m.carPaint[seed % m.carPaint.length] ?? m.carPaint[0]!;
  const second = m.carPaint[(seed + 1) % m.carPaint.length] ?? m.carPaint[1]!;
  const height = 3.05;
  const roof = spec.depth + 0.4;
  const carScale = Math.min(1, (spec.depth - 0.35) / 4.2);

  return (
    <group position={[spec.x, 0, spec.z]}>
      {/* paved apron */}
      <mesh position={[0, 0.055, 0.02]} material={m.concrete} receiveShadow>
        <boxGeometry args={[spec.width + 0.8, 0.09, spec.depth + 0.4]} />
      </mesh>
      {/* open timber canopy: keeps the cars visible from the masterplan view */}
      {[-1, 1].map((side) => (
        <mesh
          key={`edge-${side}`}
          position={[0, height, (side * (roof - 0.2)) / 2]}
          material={m.timberDark}
          castShadow
        >
          <boxGeometry args={[spec.width + 0.9, 0.2, 0.2]} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`rail-${side}`}
          position={[(side * (spec.width + 0.9)) / 2, height + 0.02, 0]}
          material={m.timber}
          castShadow
        >
          <boxGeometry args={[0.14, 0.16, roof]} />
        </mesh>
      ))}
      {Array.from({ length: lowQuality ? 4 : 9 }).map((_, index) => {
        const count = lowQuality ? 4 : 9;
        return (
          <mesh
            key={`slat-${index}`}
            position={[0, height + 0.01, -roof / 2 + 0.45 + (index * (roof - 0.9)) / (count - 1)]}
            material={m.timberDark}
            castShadow
          >
            <boxGeometry args={[spec.width + 0.9, 0.12, 0.14]} />
          </mesh>
        );
      })}
      {/* street-side posts */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (spec.width / 2 - 0.16), height / 2, spec.depth / 2 + 0.2]}
          material={m.timber}
          castShadow
        >
          <boxGeometry args={[0.17, height, 0.17]} />
        </mesh>
      ))}
      {spec.walled ? (
        <>
          {[-1, 1].map((side) => (
            <mesh
              key={`wall-${side}`}
              position={[side * (spec.width / 2), 1.5, -0.1]}
              material={m.render}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.18, 3.0, spec.depth - 0.1]} />
            </mesh>
          ))}
          {/* sectional door rolled up under the lintel */}
          <mesh position={[0, height - 0.44, spec.depth / 2 - 0.05]} material={m.charcoal} castShadow>
            <boxGeometry args={[spec.width - 0.6, 0.34, 0.15]} />
          </mesh>
        </>
      ) : (
        <mesh position={[spec.width / 2, 1.45, 0]} material={m.timber} castShadow>
          <boxGeometry args={[0.12, 2.9, spec.depth - 0.5]} />
        </mesh>
      )}
      {spec.bays === 2 ? (
        <>
          <Car x={-1.45} paint={first} scale={carScale} />
          <Car x={1.45} paint={second} scale={carScale} />
        </>
      ) : (
        <Car x={0} paint={first} scale={carScale} />
      )}
      {night && (
        <mesh position={[0, height - 0.34, spec.depth / 2 - 0.3]} material={m.lampGlass}>
          <boxGeometry args={[spec.width - 1.4, 0.07, 0.07]} />
        </mesh>
      )}
    </group>
  );
}

/* ── Private pools ────────────────────────────────────────────────────── */

function Lounger({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const m = getMaterials();
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.3, 0]} material={m.timber} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.1, 1.86]} />
      </mesh>
      <mesh position={[0, 0.38, 0.08]} material={m.white} castShadow>
        <boxGeometry args={[0.56, 0.1, 1.48]} />
      </mesh>
      <mesh position={[0, 0.5, -0.64]} rotation={[-0.62, 0, 0]} material={m.white} castShadow>
        <boxGeometry args={[0.56, 0.09, 0.72]} />
      </mesh>
      {[[-0.24, 0.72], [0.24, 0.72], [-0.24, -0.72], [0.24, -0.72]].map(([x, z], index) => (
        <mesh key={index} position={[x!, 0.15, z!]} material={m.timberDark}>
          <boxGeometry args={[0.06, 0.26, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

function Parasol({ position }: { position: [number, number, number] }) {
  const m = getMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 1.15, 0]} material={m.timber} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 2.3, 8]} />
      </mesh>
      <mesh position={[0, 2.32, 0]} material={m.white} castShadow>
        <cylinderGeometry args={[1.32, 1.32, 0.09, 16]} />
      </mesh>
      <mesh position={[0, 2.42, 0]} material={m.timber}>
        <cylinderGeometry args={[0.03, 0.03, 0.14, 6]} />
      </mesh>
    </group>
  );
}

function Planter({ position }: { position: [number, number, number] }) {
  const m = getMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]} material={m.concrete} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.32, 0.56, 12]} />
      </mesh>
      <mesh position={[0, 0.72, 0]} material={m.hedge} castShadow>
        <icosahedronGeometry args={[0.42, 1]} />
      </mesh>
    </group>
  );
}

function Pool({ pool, night, lowQuality }: { pool: PoolSpec; night: boolean; lowQuality: boolean }) {
  const m = getMaterials();
  const water = night ? m.waterNight : m.water;
  const deckWidth = pool.width + pool.deck * 2;
  const deckDepth = pool.depth + pool.deck * 2;
  const coping = 0.34;
  const colors = night ? POOL_COLORS.night : POOL_COLORS.day;
  const loungerX = pool.width / 2 + pool.deck * 0.55;

  return (
    <group position={[pool.x, 0, pool.z]}>
      {/* timber sun deck */}
      <mesh position={[0, 0.05, 0]} material={m.deck} receiveShadow castShadow>
        <boxGeometry args={[deckWidth, 0.1, deckDepth]} />
      </mesh>
      {/* pale stone coping framing the water */}
      {[
        { x: -(pool.width / 2 + coping / 2), z: 0, w: coping, d: pool.depth + coping * 2 },
        { x: pool.width / 2 + coping / 2, z: 0, w: coping, d: pool.depth + coping * 2 },
        { x: 0, z: -(pool.depth / 2 + coping / 2), w: pool.width, d: coping },
        { x: 0, z: pool.depth / 2 + coping / 2, w: pool.width, d: coping },
      ].map((rim, index) => (
        <mesh key={index} position={[rim.x, 0.11, rim.z]} material={m.stone} castShadow receiveShadow>
          <boxGeometry args={[rim.w, 0.1, rim.d]} />
        </mesh>
      ))}
      {/* tiled basin, water inset so the mosaic reads at the waterline */}
      <mesh position={[0, -0.2, 0]} material={m.poolTile} receiveShadow>
        <boxGeometry args={[pool.width, 0.52, pool.depth]} />
      </mesh>
      <mesh position={[0, 0.08, 0]} material={water}>
        <boxGeometry args={[pool.width - 0.14, 0.12, pool.depth - 0.14]} />
      </mesh>
      {/* submerged steps at one end */}
      {[0, 1, 2].map((step) => (
        <mesh
          key={step}
          position={[-pool.width / 2 + 0.42 + step * 0.36, 0.02 - step * 0.06, -pool.depth / 2 + 0.55]}
          material={m.poolTile}
          receiveShadow
        >
          <boxGeometry args={[0.36, 0.08 + step * 0.12, 1.15]} />
        </mesh>
      ))}
      {/* ladder */}
      {[-0.18, 0.18].map((offset) => (
        <mesh
          key={offset}
          position={[pool.width / 2 - 0.5 + offset, 0.3, -pool.depth / 2 + 0.9]}
          material={m.metal}
          castShadow
        >
          <boxGeometry args={[0.05, 0.72, 0.05]} />
        </mesh>
      ))}
      <mesh position={[pool.width / 2 - 0.5, 0.6, -pool.depth / 2 + 0.9]} material={m.metal}>
        <boxGeometry args={[0.46, 0.05, 0.05]} />
      </mesh>
      {/* furniture on the sun deck */}
      <Lounger position={[loungerX, 0.1, 0.95]} />
      <Lounger position={[loungerX, 0.1, -0.95]} />
      {!lowQuality && <Parasol position={[-(pool.width / 2 + pool.deck * 0.55), 0.1, 0]} />}
      {!lowQuality && <Planter position={[-deckWidth / 2 + 0.55, 0.09, deckDepth / 2 - 0.6]} />}
      {!lowQuality && <Planter position={[-deckWidth / 2 + 0.55, 0.09, -deckDepth / 2 + 0.6]} />}
      {/* underwater lighting at night */}
      {night && (
        <>
          <mesh position={[-pool.width / 2 + 0.06, 0.02, 0]} material={m.poolLight}>
            <boxGeometry args={[0.04, 0.12, pool.depth * 0.6]} />
          </mesh>
          <mesh position={[pool.width / 2 - 0.06, 0.02, 0]} material={m.poolLight}>
            <boxGeometry args={[0.04, 0.12, pool.depth * 0.6]} />
          </mesh>
          {!lowQuality && <pointLight position={[0, 0.4, 0]} intensity={2.6} distance={7} decay={2} color={colors.water} />}
        </>
      )}
    </group>
  );
}

function Plot({
  entry,
  pool,
  garage,
  rearDepth,
  night,
  lowQuality,
}: {
  entry: SceneEntry;
  pool: PoolSpec | null;
  garage: GarageSpec | null;
  rearDepth: number;
  night: boolean;
  lowQuality: boolean;
}) {
  const seed = Number(entry.property.code.replace(/\D/g, "")) || 1;
  return (
    <group position={[entry.position.x, 0, entry.position.z]} rotation={[0, (entry.rotationY * Math.PI) / 180, 0]}>
      <PlotBoundary typology={entry.property.typology} rearDepth={rearDepth} />
      {pool && <Pool pool={pool} night={night} lowQuality={lowQuality} />}
      {garage && <Garage spec={garage} seed={seed} night={night} lowQuality={lowQuality} />}
    </group>
  );
}

function StreetLamps({ night, lowQuality }: { night: boolean; lowQuality: boolean }) {
  const m = getMaterials();
  const lamps = React.useMemo(() => lampPositions(), []);
  const globe = m.lampGlass;
  React.useEffect(() => {
    globe.emissiveIntensity = night ? 2.4 : 0.2;
    globe.needsUpdate = true;
  }, [globe, night]);
  return (
    <group>
      {lamps.map((lamp, i) => (
        <group key={i} position={[lamp.x, 0, lamp.z]}>
          <mesh position={[0, 2.1, 0]} material={m.metal} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 4.2, 8]} />
          </mesh>
          <mesh position={[0, 4.25, 0]} material={globe}>
            <sphereGeometry args={[0.16, 12, 10]} />
          </mesh>
          {night && !lowQuality && i % 2 === 0 && <pointLight position={[0, 4.1, 0]} intensity={3.2} distance={12} decay={2} color="#ffbe83" />}
        </group>
      ))}
    </group>
  );
}

function Boundary() {
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

/* ── Lighting ─────────────────────────────────────────────────────────── */

const SUN_POSITION: [number, number, number] = [-70, 55, -90];
const MOON_POSITION: [number, number, number] = [-58, 46, 74];

export type TimeOfDay = "day" | "night";

export interface SceneTheme {
  background: string;
  fog: [string, number, number];
  ambient: number;
  hemisphere: number;
  sun: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  exposure: number;
}

export const THEMES: Record<TimeOfDay, SceneTheme> = {
  day: {
    background: "#cfd6d1",
    fog: ["#cfd6d1", 120, 340],
    ambient: 0.3,
    hemisphere: 0.72,
    sun: SUN_POSITION,
    sunIntensity: 2.75,
    sunColor: "#ffe4bd",
    exposure: 1.04,
  },
  night: {
    background: "#0b1016",
    fog: ["#0b1016", 95, 300],
    ambient: 0.14,
    hemisphere: 0.22,
    sun: MOON_POSITION,
    sunIntensity: 0.7,
    sunColor: "#b9cbe8",
    exposure: 1.18,
  },
};

/** Tone-mapping exposure has to follow the theme, or night reads as grey mud. */
function Exposure({ value }: { value: number }) {
  const gl = useThree((state) => state.gl);
  React.useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

function Lighting({ lowQuality, time }: { lowQuality: boolean; time: TimeOfDay }) {
  const theme = THEMES[time];
  const night = time === "night";
  return (
    <>
      <ambientLight intensity={theme.ambient} color={night ? "#8fa0bd" : "#f0ece0"} />
      <hemisphereLight args={[night ? "#33415c" : "#dfe7ea", night ? "#1b1d17" : "#6f6a54", theme.hemisphere]} />
      <directionalLight
        position={theme.sun}
        intensity={theme.sunIntensity}
        color={theme.sunColor}
        castShadow
        shadow-mapSize-width={lowQuality ? 1024 : 2048}
        shadow-mapSize-height={lowQuality ? 1024 : 2048}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={58}
        shadow-camera-bottom={-58}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {night && <directionalLight position={[40, 18, -50]} intensity={0.22} color="#6f86b6" />}
      <Environment resolution={lowQuality ? 64 : 128} frames={1}>
        <color attach="background" args={[night ? "#0e1622" : "#cdd6d8"]} />
        <Lightformer intensity={night ? 0.35 : 2.2} position={[0, 10, -20]} scale={[30, 20, 1]} color={night ? "#3d5170" : "#fff0d6"} />
        <Lightformer intensity={night ? 0.22 : 1.1} position={[-25, 8, 12]} scale={[16, 10, 1]} color={night ? "#2b3a52" : "#dbe7ea"} />
        <Lightformer intensity={night ? 0.16 : 0.7} position={[20, 5, 20]} scale={[18, 8, 1]} color={night ? "#2a3244" : "#e8e4d4"} />
      </Environment>
    </>
  );
}

/* ── Scene ────────────────────────────────────────────────────────────── */

export interface SiteSceneProps {
  entries: SceneEntry[];
  selectedId: string | null;
  hoveredId: string | null;
  visibleIds: Set<string>;
  lowQuality: boolean;
  /** Day/night presentation. Defaults to day. */
  timeOfDay?: TimeOfDay;
  assetIndex?: Record<string, unknown>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function Moon() {
  return (
    <group position={[-90, 96, -150]}>
      <mesh>
        <sphereGeometry args={[7.5, 32, 24]} />
        <meshBasicMaterial color="#e9eef8" toneMapped={false} />
      </mesh>
      <mesh scale={2.4}>
        <sphereGeometry args={[7.5, 24, 18]} />
        <meshBasicMaterial color="#8097c4" transparent opacity={0.12} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function SiteScene({
  entries,
  selectedId,
  hoveredId,
  visibleIds,
  lowQuality,
  timeOfDay = "day",
  onSelect,
  onHover,
}: SiteSceneProps) {
  const m = getMaterials();
  const theme = THEMES[timeOfDay];
  const night = timeOfDay === "night";

  // Gardens are clipped to the perimeter, so each house gets its own rear depth
  // and only keeps a pool when the water and its deck genuinely fit.
  const plots = React.useMemo(
    () =>
      entries.map((entry) => {
        const rearDepth = plotRearDepth(entry.position, entry.rotationY, entry.property.typology);
        const { garage } = garagePlan(entry.position, entry.rotationY, entry.property.typology);
        return {
          rearDepth,
          pool: poolFor(entry.property.code, entry.property.typology, rearDepth),
          garage,
        };
      }),
    [entries],
  );

  return (
    <>
      <color attach="background" args={[theme.background]} />
      <fog attach="fog" args={theme.fog} />
      <Exposure value={theme.exposure} />
      {night ? (
        <>
          <Stars radius={260} depth={70} count={lowQuality ? 900 : 2200} factor={4.5} saturation={0} fade speed={0.4} />
          <Moon />
        </>
      ) : (
        <Sky distance={20000} sunPosition={SUN_POSITION} turbidity={5} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.82} />
      )}
      <Lighting lowQuality={lowQuality} time={timeOfDay} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]} material={m.grass} receiveShadow>
        <planeGeometry args={[220, 200, 1, 1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 4]} material={m.lawn} receiveShadow>
        <circleGeometry args={[15, 64]} />
      </mesh>

      <Roads />
      <Driveways entries={entries} plots={plots} />
      <Trees entries={entries} plots={plots} lowQuality={lowQuality} night={night} />
      <Shrubs entries={entries} lowQuality={lowQuality} />
      <StreetLamps night={night} lowQuality={lowQuality} />
      <Boundary />

      {entries.map((entry, index) => (
        <Plot
          key={`plot-${entry.property.id}`}
          entry={entry}
          pool={plots[index]?.pool ?? null}
          garage={plots[index]?.garage ?? null}
          rearDepth={plots[index]?.rearDepth ?? 5.2}
          night={night}
          lowQuality={lowQuality}
        />
      ))}

      {entries.map((entry) => {
        const ghosted = !visibleIds.has(entry.property.id);
        return (
          <HouseExterior
            key={entry.property.id}
            property={entry.property}
            position={entry.position}
            rotationY={entry.rotationY}
            selected={selectedId === entry.property.id}
            hovered={hoveredId === entry.property.id}
            ghosted={ghosted}
            lowQuality={lowQuality}
            night={night}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </>
  );
}
