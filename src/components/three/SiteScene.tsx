"use client";

import * as React from "react";
import * as THREE from "three";
import { Environment, Lightformer, Sky } from "@react-three/drei";
import { getMaterials } from "./materials";
import { HouseExterior } from "./HouseExterior";
import { drivewayFor, lampPositions, scatterShrubs, scatterTrees, SITE } from "@/lib/3d/site";
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[26, 0.045, 36.4]} material={m.asphalt} receiveShadow>
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

function Trees({ entries, lowQuality }: { entries: SceneEntry[]; lowQuality: boolean }) {
  const m = getMaterials();
  const trunks = React.useRef<THREE.InstancedMesh>(null);
  const foliage = [React.useRef<THREE.InstancedMesh>(null), React.useRef<THREE.InstancedMesh>(null), React.useRef<THREE.InstancedMesh>(null)];
  const trees = React.useMemo(
    () =>
      scatterTrees({
        houses: entries.map((e) => ({ position: e.position, typology: e.property.typology, rotationY: e.rotationY })),
        count: lowQuality ? 55 : 130,
        seed: 20261021,
      }),
    [entries, lowQuality],
  );

  React.useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const counts = [0, 0, 0];

    trees.forEach((tree, index) => {
      if (index > 400) return;
      position.set(tree.x, 1.15 * tree.scale, tree.z);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.rotation);
      scale.set(tree.scale, tree.scale, tree.scale);
      matrix.compose(position, quaternion, scale);
      trunks.current?.setMatrixAt(index, matrix);

      const mesh = foliage[tree.variant]?.current;
      if (mesh) {
        position.set(tree.x, (3.0 + (tree.variant === 1 ? 0.4 : 0)) * tree.scale, tree.z);
        scale.set(1.55 * tree.scale, (1.3 + tree.variant * 0.12) * tree.scale, 1.55 * tree.scale);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.rotation);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(counts[tree.variant]!, matrix);
        counts[tree.variant]! += 1;
      }
    });
    if (trunks.current) {
      trunks.current.count = trees.length;
      trunks.current.instanceMatrix.needsUpdate = true;
    }
    foliage.forEach((ref, i) => {
      if (!ref.current) return;
      ref.current.count = counts[i]!;
      ref.current.instanceMatrix.needsUpdate = true;
    });
  }, [trees]);

  const trunkGeometry = React.useMemo(() => new THREE.CylinderGeometry(0.13, 0.2, 2.3, 6), []);
  const canopyGeometry = React.useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  React.useEffect(
    () => () => {
      trunkGeometry.dispose();
      canopyGeometry.dispose();
    },
    [trunkGeometry, canopyGeometry],
  );

  return (
    <group>
      <instancedMesh ref={trunks} args={[trunkGeometry, m.trunk, trees.length]} castShadow receiveShadow frustumCulled={false} />
      {foliage.map((ref, index) => (
        <instancedMesh
          key={index}
          ref={ref}
          args={[canopyGeometry, m.foliage[index]!, Math.max(1, Math.ceil(trees.length / 2))]}
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
      ).slice(0, lowQuality ? 25 : 55),
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
    });
    ref.current.count = shrubs.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [shrubs]);
  const geometry = React.useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  React.useEffect(() => () => geometry.dispose(), [geometry]);
  return <instancedMesh ref={ref} args={[geometry, m.hedge, Math.max(1, shrubs.length)]} castShadow receiveShadow frustumCulled={false} />;
}

function StreetLamps() {
  const m = getMaterials();
  const lamps = React.useMemo(() => lampPositions(), []);
  const globe = React.useMemo(() => new THREE.MeshStandardMaterial({ color: "#fff1d2", emissive: "#ffce8a", emissiveIntensity: 1.2, roughness: 0.4 }), []);
  React.useEffect(() => () => globe.dispose(), [globe]);
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
        </group>
      ))}
    </group>
  );
}

function Boundary() {
  const m = getMaterials();
  const walls = [
    { x: 0, z: -42, w: 94, d: 0.5 },
    { x: -47, z: 2, w: 0.5, d: 88 },
    { x: 47, z: 2, w: 0.5, d: 88 },
    { x: -37, z: 45, w: 20, d: 0.5 },
    { x: 37, z: 45, w: 20, d: 0.5 },
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
      <group position={[26, 0, 40]}>
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
    <mesh position={[0, 3.32, 0.32]}>
      <planeGeometry args={[5.4, 1.35]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/* ── Lighting ─────────────────────────────────────────────────────────── */

const SUN_POSITION: [number, number, number] = [-70, 55, -90];

function Lighting({ lowQuality }: { lowQuality: boolean }) {
  return (
    <>
      <ambientLight intensity={0.32} color="#f0ece0" />
      <hemisphereLight args={["#dfe7ea", "#6f6a54", 0.75]} />
      <directionalLight
        position={SUN_POSITION}
        intensity={2.7}
        color="#ffe4bd"
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
      <Environment resolution={lowQuality ? 64 : 128} frames={1}>
        <color attach="background" args={["#cdd6d8"]} />
        <Lightformer intensity={2.2} position={[0, 10, -20]} scale={[30, 20, 1]} color="#fff0d6" />
        <Lightformer intensity={1.1} position={[-25, 8, 12]} scale={[16, 10, 1]} color="#dbe7ea" />
        <Lightformer intensity={0.7} position={[20, 5, 20]} scale={[18, 8, 1]} color="#e8e4d4" />
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
  assetIndex?: Record<string, unknown>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function SiteScene({ entries, selectedId, hoveredId, visibleIds, lowQuality, onSelect, onHover }: SiteSceneProps) {
  const m = getMaterials();
  const ground = React.useMemo(() => {
    return null;
  }, []);
  void ground;

  return (
    <>
      <color attach="background" args={["#cfd6d1"]} />
      <fog attach="fog" args={["#cfd6d1", 120, 340]} />
      <Sky distance={20000} sunPosition={SUN_POSITION} turbidity={5} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.82} />
      <Lighting lowQuality={lowQuality} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]} material={m.grass} receiveShadow>
        <planeGeometry args={[220, 200, 1, 1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 4]} material={m.lawn} receiveShadow>
        <circleGeometry args={[15, 64]} />
      </mesh>

      <Roads />
      <Driveways entries={entries} />
      <Trees entries={entries} lowQuality={lowQuality} />
      <Shrubs entries={entries} lowQuality={lowQuality} />
      <StreetLamps />
      <Boundary />

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
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </>
  );
}
