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
  lampPositions,
  plotRearDepth,
  plotWallsFor,
  poolFor,
  poolKeepOut,
  scatterShrubs,
  scatterTrees,
  SITE,
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

function Driveways({ entries }: { entries: SceneEntry[] }) {
  const m = getMaterials();
  const driveways = React.useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          driveway: drivewayFor(entry.position, entry.property.typology, entry.rotationY),
        }))
        .filter((d): d is { entry: SceneEntry; driveway: NonNullable<ReturnType<typeof drivewayFor>> } => d.driveway !== null),
    [entries],
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
      count: lowQuality ? 90 : 190,
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

function Pool({ pool, night, lowQuality }: { pool: PoolSpec; night: boolean; lowQuality: boolean }) {
  const m = getMaterials();
  const water = night ? m.waterNight : m.water;
  const deckWidth = pool.width + pool.deck * 2;
  const deckDepth = pool.depth + pool.deck * 2;
  const colors = night ? POOL_COLORS.night : POOL_COLORS.day;

  return (
    <group position={[pool.x, 0, pool.z]}>
      {/* coping / sun deck */}
      <mesh position={[0, 0.06, 0]} material={m.concrete} receiveShadow castShadow>
        <boxGeometry args={[deckWidth, 0.12, deckDepth]} />
      </mesh>
      {/* basin walls */}
      <mesh position={[0, -0.12, 0]} material={m.stone} receiveShadow>
        <boxGeometry args={[pool.width, 0.36, pool.depth]} />
      </mesh>
      {/* water */}
      <mesh position={[0, 0.09, 0]} material={water}>
        <boxGeometry args={[pool.width - 0.12, 0.1, pool.depth - 0.12]} />
      </mesh>
      {/* steps at one end */}
      {[0, 1, 2].map((step) => (
        <mesh
          key={step}
          position={[-pool.width / 2 + 0.4 + step * 0.34, 0.02 - step * 0.06, -pool.depth / 2 + 0.55]}
          material={m.concrete}
          receiveShadow
        >
          <boxGeometry args={[0.34, 0.06 + step * 0.12, 1.1]} />
        </mesh>
      ))}
      {/* ladder */}
      {[-0.16, 0.16].map((offset) => (
        <mesh key={offset} position={[pool.width / 2 - 0.5 + offset, 0.28, -pool.depth / 2 + 0.9]} material={m.metal} castShadow>
          <boxGeometry args={[0.05, 0.7, 0.05]} />
        </mesh>
      ))}
      <mesh position={[pool.width / 2 - 0.5, 0.56, -pool.depth / 2 + 0.9]} material={m.metal}>
        <boxGeometry args={[0.42, 0.05, 0.05]} />
      </mesh>
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
  rearDepth,
  night,
  lowQuality,
}: {
  entry: SceneEntry;
  pool: PoolSpec | null;
  rearDepth: number;
  night: boolean;
  lowQuality: boolean;
}) {
  return (
    <group position={[entry.position.x, 0, entry.position.z]} rotation={[0, (entry.rotationY * Math.PI) / 180, 0]}>
      <PlotBoundary typology={entry.property.typology} rearDepth={rearDepth} />
      {pool && <Pool pool={pool} night={night} lowQuality={lowQuality} />}
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
        return { rearDepth, pool: poolFor(entry.property.code, entry.property.typology, rearDepth) };
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
      <Driveways entries={entries} />
      <Trees entries={entries} plots={plots} lowQuality={lowQuality} night={night} />
      <Shrubs entries={entries} lowQuality={lowQuality} />
      <StreetLamps night={night} lowQuality={lowQuality} />
      <Boundary />

      {entries.map((entry, index) => (
        <Plot
          key={`plot-${entry.property.id}`}
          entry={entry}
          pool={plots[index]?.pool ?? null}
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
