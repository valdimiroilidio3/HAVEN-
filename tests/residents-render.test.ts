import * as React from "react";
import { act } from "react";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { create } from "@react-three/test-renderer";
import { Residents } from "@/components/three/site/Residents";
import { BODY_INSTANCES, BODY_PART_COUNT, BODY_PARTS, instanceSlot } from "@/lib/3d/resident-skeleton";
import {
  getResidentControls,
  getResidentSnapshot,
  resetResidentSession,
  setResidentRunning,
} from "@/lib/3d/resident-store";

/**
 * The population as it is actually mounted.
 *
 * These tests do not call the simulation helpers: they mount the real
 * `<Residents />` component through React Three Fiber's test renderer, run
 * frames, and then read the instance buffers the GPU would receive. That is as
 * close to "it is on screen" as this environment gets — it exercises the
 * component, the effect, the frame loop, the instance slots and the colours.
 */

beforeAll(() => {
  // The component reads `document.hidden`; there is no DOM in this environment.
  (globalThis as { document?: unknown }).document = {
    hidden: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetResidentSession();
  setResidentRunning(true);
});

type Instanced = { mesh: THREE.InstancedMesh; part: string };

/**
 * The meshes, in draw order, matched to the parts they represent.
 *
 * Capacity alone cannot identify a part — every paired limb has the same count —
 * so the order of `BODY_PARTS` (which is the order the component renders) is the
 * key, and the capacity is then asserted against the expected one.
 */
function collect(renderer: Awaited<ReturnType<typeof create>>, bodies = 20): Instanced[] {
  const found: THREE.InstancedMesh[] = [];
  const visit = (node: { children?: unknown[]; instance?: THREE.Object3D }) => {
    const instance = node.instance as THREE.InstancedMesh | undefined;
    if (instance && instance.isInstancedMesh) found.push(instance);
    for (const child of node.children ?? []) visit(child as { children?: unknown[] });
  };
  visit(renderer.scene as unknown as { children?: unknown[] });

  expect(found).toHaveLength(BODY_PARTS.length);
  return found.map((mesh, index) => {
    const part = BODY_PARTS[index]!;
    expect(mesh.count, `capacity of ${part}`).toBe(BODY_PART_COUNT[part] * bodies);
    return { mesh, part };
  });
}

function positions(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    out.push(point.setFromMatrixPosition(matrix).clone());
  }
  return out;
}

describe("Residents, mounted", () => {
  // First in the file on purpose: it resets the shared population session,
  // so it must not inherit a population another test already moved.
  it("regenerates on demand, and pausing stops the simulation", async () => {
    resetResidentSession();
    const renderer = await create(React.createElement(Residents, { count: 20 }));
    await renderer.advanceFrames(60, 1 / 30);
    const head = collect(renderer).find((entry) => entry.part === "head")!.mesh;
    const before = positions(head).filter((_, index) => index % 3 === 0);

    const controls = getResidentControls();
    expect(controls).not.toBeNull();
    // The rebuild is a React state change, so it has to be flushed inside act:
    // a bare call in a test never re-renders and the old population stays.
    await act(async () => {
      controls!.regenerate();
    });
    await renderer.advanceFrames(4, 1 / 30);
    const regenerated = positions(collect(renderer).find((entry) => entry.part === "head")!.mesh).filter((_, index) => index % 3 === 0);
    const changed = regenerated.filter((point, index) => point.distanceTo(before[index]!) > 1).length;
    expect(changed).toBeGreaterThan(8);

    // Paused: nobody moves.
    setResidentRunning(false);
    const frozen = positions(collect(renderer).find((entry) => entry.part === "head")!.mesh).filter((_, index) => index % 3 === 0);
    await renderer.advanceFrames(45, 1 / 30);
    const stillFrozen = positions(collect(renderer).find((entry) => entry.part === "head")!.mesh).filter((_, index) => index % 3 === 0);
    for (let body = 0; body < 20; body += 1) {
      expect(stillFrozen[body]!.distanceTo(frozen[body]!)).toBeLessThan(0.001);
    }
    setResidentRunning(true);
    renderer.unmount();
  });

  it(`puts ${BODY_PARTS.length} instanced meshes and ${BODY_INSTANCES} pieces per body in the scene`, async () => {
    const renderer = await create(React.createElement(Residents, { count: 20 }));
    await renderer.advanceFrames(2, 1 / 60);
    const meshes = collect(renderer);
    expect(meshes).toHaveLength(BODY_PARTS.length);
    expect(meshes.every((entry) => entry.part !== "unknown:0" && !entry.part.startsWith("unknown"))).toBe(true);
    const total = meshes.reduce((sum, entry) => sum + entry.mesh.count, 0);
    expect(total).toBe(20 * BODY_INSTANCES);
    renderer.unmount();
  });

  it("writes a different, finite transform for every body, every frame", async () => {
    resetResidentSession();
    const renderer = await create(React.createElement(Residents, { count: 20 }));
    await renderer.advanceFrames(2, 1 / 60);
    const head = collect(renderer).find((entry) => entry.part === "head")!.mesh;
    const before = positions(head);

    // Skull slot of each body: three head instances per body (skull, nose, neck).
    const skulls = before.filter((_, index) => index % 3 === 0);
    expect(skulls).toHaveLength(20);
    const distinct = new Set(skulls.map((point) => `${point.x.toFixed(2)},${point.z.toFixed(2)}`));
    expect(distinct.size).toBe(20);
    for (const point of before) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)).toBe(true);
      // Heads are at adult height above the ground, not under the terrain.
      if (point.y !== 0) expect(point.y).toBeGreaterThan(1.3);
      expect(point.y).toBeLessThan(2.1);
    }

    await renderer.advanceFrames(90, 1 / 30);
    const after = positions(head);
    const moved = after.filter((point, index) => point.distanceTo(before[index]!) > 0.2).length;
    expect(moved).toBeGreaterThan(4);
    renderer.unmount();
  });

  it("gives each body its own instance slots and its own colours", async () => {
    resetResidentSession();
    const renderer = await create(React.createElement(Residents, { count: 20 }));
    await renderer.advanceFrames(2, 1 / 60);
    const meshes = collect(renderer);

    for (const { mesh, part } of meshes) {
      const matrix = new THREE.Matrix4();
      const seen = new Set<string>();
      for (let body = 0; body < 20; body += 1) {
        for (let slot = 0; slot < BODY_PART_COUNT[part as keyof typeof BODY_PART_COUNT]; slot += 1) {
          const index = instanceSlot(body, part as keyof typeof BODY_PART_COUNT, slot);
          mesh.getMatrixAt(index, matrix);
          const key = matrix.elements.map((value) => value.toFixed(4)).join(",");
          expect(seen.has(key), `${part} instance ${index} duplicates another body`).toBe(false);
          seen.add(key);
        }
      }
      expect(mesh.instanceColor).not.toBeNull();
    }

    const colour = new THREE.Color();
    const chest = meshes.find((entry) => entry.part === "chest")!.mesh;
    const shirts = new Set<string>();
    for (let body = 0; body < 20; body += 1) {
      chest.getColorAt(body, colour);
      shirts.add(colour.getHexString());
    }
    expect(shirts.size).toBeGreaterThan(3);
    renderer.unmount();
  });

  it("reports measured counts, not the simulation length dressed up as visibility", async () => {
    resetResidentSession();
    const renderer = await create(React.createElement(Residents, { count: 20 }));
    await renderer.advanceFrames(30, 1 / 30);
    const snapshot = getResidentSnapshot();
    expect(snapshot.created).toBe(20);
    expect(snapshot.instances).toBe(20 * BODY_INSTANCES);
    expect(snapshot.inFrustum).toBeGreaterThanOrEqual(0);
    expect(snapshot.inFrustum).toBeLessThanOrEqual(20);
    expect(snapshot.walking + snapshot.pausing + snapshot.interacting + snapshot.idle).toBe(20);
    expect(snapshot.navFailures).toBe(0);
    expect(snapshot.errors).toEqual([]);
    renderer.unmount();
  });

  it("keeps the population when the scene is torn down and mounted again", async () => {
    resetResidentSession();
    const first = await create(React.createElement(Residents, { count: 20 }));
    await first.advanceFrames(120, 1 / 30);
    const head = collect(first).find((entry) => entry.part === "head")!.mesh;
    const before = positions(head).filter((_, index) => index % 3 === 0);
    first.unmount();

    const second = await create(React.createElement(Residents, { count: 20 }));
    await second.advanceFrames(1, 1 / 30);
    const after = positions(collect(second).find((entry) => entry.part === "head")!.mesh).filter((_, index) => index % 3 === 0);

    // Same people, same places — a remount resumes instead of resetting.
    for (let body = 0; body < 20; body += 1) {
      expect(after[body]!.distanceTo(before[body]!)).toBeLessThan(0.6);
    }
    second.unmount();
  });

});
