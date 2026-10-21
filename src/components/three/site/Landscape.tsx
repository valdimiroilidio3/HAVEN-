"use client";

import * as React from "react";
import * as THREE from "three";
import {
  plantingBeds,
  poolKeepOut,
  scatterFlowers,
  scatterShrubs,
  scatterTrees,
  sportsKeepOut,
  type PoolSpec,
  type Rect,
  type TreeKind,
} from "@/lib/3d/site";
import { buildCanopies, canopyTint } from "../vegetation";
import { getMaterials } from "../materials";
import type { SceneEntry } from "./types";

/**
 * Planting.
 *
 * Every plant is scatter-placed inside a declared bed and rejected from private
 * plots, roads, courts and the lagoon. The exclusion list is derived from the
 * plot footprints the renderer draws, so a plot can never grow a tree in its
 * living room when someone tweaks a margin.
 */

export function Trees({
  entries,
  plots,
  exclude,
  lowQuality,
  night,
}: {
  entries: SceneEntry[];
  plots: Array<{ pool: PoolSpec | null; rearDepth: number }>;
  /** Private plot footprints: no canopy may overlap a garden wall. */
  exclude: Rect[];
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
      count: lowQuality ? 54 : 96,
      seed: 20261021,
      keepOut: [...keepOut, ...sportsKeepOut()],
      exclude,
    });
  }, [entries, plots, exclude, lowQuality]);

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

export function Shrubs({
  entries,
  exclude,
  lowQuality,
}: {
  entries: SceneEntry[];
  exclude: Rect[];
  lowQuality: boolean;
}) {
  const m = getMaterials();
  const ref = React.useRef<THREE.InstancedMesh>(null);
  const shrubs = React.useMemo(
    () =>
      scatterShrubs(
        entries.map((e) => ({ position: e.position, typology: e.property.typology, rotationY: e.rotationY })),
        913,
        exclude,
      ).slice(0, lowQuality ? 30 : 70),
    [entries, exclude, lowQuality],
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

export function Flowers({ exclude, lowQuality }: { exclude: Rect[]; lowQuality: boolean }) {
  const m = getMaterials();
  const ref = React.useRef<THREE.InstancedMesh>(null);
  const flowers = React.useMemo(
    () => scatterFlowers(4242, exclude).slice(0, lowQuality ? 90 : 220),
    [exclude, lowQuality],
  );
  const tones = React.useMemo(
    () => ["#e8a0a6", "#f0d08a", "#d9d2f0"].map((tone) => new THREE.Color(tone)),
    [],
  );
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    flowers.forEach((flower, index) => {
      matrix.compose(
        new THREE.Vector3(flower.x, 0.18 * flower.scale, flower.z),
        new THREE.Quaternion(),
        new THREE.Vector3(flower.scale, flower.scale, flower.scale),
      );
      ref.current!.setMatrixAt(index, matrix);
      ref.current!.setColorAt(index, tones[flower.tone]!);
    });
    ref.current.count = flowers.length;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [flowers, tones]);
  const geometry = React.useMemo(() => new THREE.IcosahedronGeometry(0.34, 0), []);
  React.useEffect(() => () => geometry.dispose(), [geometry]);
  return <instancedMesh ref={ref} args={[geometry, m.flowers, Math.max(1, flowers.length)]} castShadow frustumCulled={false} />;
}

export function BedBorders({ exclude, lowQuality }: { exclude: Rect[]; lowQuality: boolean }) {
  const m = getMaterials();
  const segments = React.useMemo(() => {
    const out: Array<{ x: number; z: number; w: number; d: number }> = [];
    for (const bed of plantingBeds(exclude)) {
      const h = 0.42;
      out.push({ x: (bed.minX + bed.maxX) / 2, z: bed.minZ, w: bed.maxX - bed.minX, d: h });
      out.push({ x: (bed.minX + bed.maxX) / 2, z: bed.maxZ, w: bed.maxX - bed.minX, d: h });
      out.push({ x: bed.minX, z: (bed.minZ + bed.maxZ) / 2, w: h, d: bed.maxZ - bed.minZ });
      out.push({ x: bed.maxX, z: (bed.minZ + bed.maxZ) / 2, w: h, d: bed.maxZ - bed.minZ });
    }
    return out;
  }, [exclude]);
  return (
    <group>
      {segments.map((segment, index) => (
        <mesh key={index} position={[segment.x, 0.32, segment.z]} material={m.hedge} receiveShadow castShadow>
          <boxGeometry args={[segment.w, 0.64, segment.d]} />
        </mesh>
      ))}
      {!lowQuality && <ShrubBorder exclude={exclude} />}
    </group>
  );
}

function ShrubBorder({ exclude }: { exclude: Rect[] }) {
  const m = getMaterials();
  const positions = React.useMemo(() => {
    const out: Array<{ x: number; z: number }> = [];
    for (const bed of plantingBeds(exclude)) {
      const step = 9;
      for (let x = bed.minX + step / 2; x < bed.maxX; x += step) out.push({ x, z: bed.minZ + 0.6 });
      for (let z = bed.minZ + step / 2; z < bed.maxZ; z += step) out.push({ x: bed.maxX - 0.6, z });
    }
    return out.slice(0, 90);
  }, []);
  return (
    <group>
      {positions.map((position, index) => (
        <mesh key={index} position={[position.x, 0.75, position.z]} material={m.hedge} castShadow>
          <icosahedronGeometry args={[0.85, 1]} />
        </mesh>
      ))}
    </group>
  );
}
