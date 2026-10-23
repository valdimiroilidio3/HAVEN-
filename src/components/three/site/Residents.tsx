/**
 * Residents of the condominium — the renderer.
 *
 * One `InstancedMesh` per body part for the whole population, so twenty people
 * cost nine draw calls rather than two hundred. Nothing is created while
 * rendering: geometries, materials and colours are built once in `useMemo`; the
 * frame loop only writes matrices.
 *
 * Where the pieces of a body sit is decided by `lib/3d/resident-skeleton`, the
 * same module the offline rasteriser uses. A body is an articulated figure —
 * head, hair, chest, hips, upper arm, forearm, thigh, shin, shoe — not a capsule.
 */
"use client";

import * as React from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { RESIDENTS, residentWorldFor, stepResidentSim, type Resident, type ResidentSim } from "@/lib/3d/residents";
import {
  BODY_INSTANCES,
  BODY_PARTS,
  BODY_PART_COUNT,
  BODY_PRIMITIVE,
  PART_COLOUR,
  createBodyBuffer,
  fillBody,
  instanceSlot,
  limbAxis,
  type BodyPartName,
} from "@/lib/3d/resident-skeleton";
import {
  acquireResidentSession,
  clearResidentSnapshot,
  getResidentSelection,
  isResidentRunning,
  publishResidentSnapshot,
  registerResidentControls,
  resetResidentSession,
  setResidentRunning,
  setResidentSelection,
  type ResidentSample,
} from "@/lib/3d/resident-store";

const SHOE_COLOUR = 0x1d1f22;

export function Residents({ count = RESIDENTS.defaultCount }: { count?: number }): React.JSX.Element {
  const group = React.useRef<THREE.Group>(null);
  const meshes = React.useRef<Partial<Record<BodyPartName, THREE.InstancedMesh | null>>>({});
  const highlight = React.useRef<THREE.Mesh>(null);
  const simRef = React.useRef<ResidentSim | null>(null);
  const generation = React.useRef(0);
  const [revision, setRevision] = React.useState(0);

  const entries = React.useMemo(
    () =>
      SEED_UNITS.map((unit) => ({
        code: unit.code,
        position: { x: unit.position.x, z: unit.position.z },
        rotationY: unit.position.rotationY,
        typology: unit.typology,
      })),
    [],
  );

  // Stable across mounts, so the population session is reused rather than rebuilt.
  const world = React.useMemo(() => residentWorldFor(entries), [entries]);

  // Two geometries and five materials serve the whole population.
  const assets = React.useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 12, 9);
    return {
      geometries: {
        ellipsoid: sphere,
        hair: new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.5),
        cylinder: new THREE.CylinderGeometry(1, 1, 1, 8, 1),
      },
      materials: {
        skin: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 }),
        hair: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
        shirt: new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }),
        trousers: new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0 }),
        shoe: new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.04 }),
        eye: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 }),
      } as const,
    };
  }, []);

  React.useEffect(
    () => () => {
      Object.values(assets.geometries).forEach((geometry) => geometry.dispose());
      Object.values(assets.materials).forEach((material) => material.dispose());
    },
    [assets],
  );

  const body = React.useMemo(() => createBodyBuffer(), []);
  const scratch = React.useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      yawQuaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      frustum: new THREE.Frustum(),
      projection: new THREE.Matrix4(),
      view: new THREE.Matrix4(),
      point: new THREE.Vector3(),
      reportAt: 0,
      sample: [] as ResidentSample[],
    }),
    [],
  );

  // The simulation is built once per revision — never per frame, never twice.
  React.useEffect(() => {
    // The session lives in the store, not in this component: a remount resumes
    // the same population instead of starting a second one.
    const { sim } = acquireResidentSession(world, count, 20260214 + generation.current * 7919);
    simRef.current = sim;
    setResidentSelection(null);

    // Instance colours, written once, here.
    for (const resident of sim.residents) {
      const colours: Record<BodyPartName, number> = {
        head: resident.style.skin,
        hair: resident.style.hair,
        eye: 0x2a2320,
        chest: resident.style.shirt,
        hips: resident.style.trousers,
        armUpper: resident.style.shirt,
        armLower: resident.style.skin,
        legUpper: resident.style.trousers,
        legLower: resident.style.trousers,
        hand: resident.style.skin,
        shoe: SHOE_COLOUR,
      };
      for (const part of BODY_PARTS) {
        const mesh = meshes.current[part];
        if (!mesh) continue;
        const colour = new THREE.Color(colours[part]);
        const perBody = BODY_PART_COUNT[part];
        for (let i = 0; i < perBody; i += 1) mesh.setColorAt(resident.index * perBody + i, colour);
      }
    }
    for (const part of BODY_PARTS) {
      const mesh = meshes.current[part];
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    registerResidentControls({
      regenerate: () => {
        generation.current += 1;
        resetResidentSession();
        setRevision((value) => value + 1);
      },
      setRunning: (next) => setResidentRunning(next),
    });

    return () => {
      // Deliberately does not reset the session: the population survives the
      // scene being torn down and rebuilt.
      registerResidentControls(null);
      clearResidentSnapshot();
      simRef.current = null;
    };
  }, [world, count, revision]);

  useFrame((state, delta) => {
    const sim = simRef.current;
    const root = group.current;
    if (!sim || !root) return;

    if (isResidentRunning() && !document.hidden) {
      // Cap the step: a tab returning from the background delivers seconds at once.
      stepResidentSim(sim, Math.min(delta, RESIDENTS.maxDelta));
    }

    // The camera's world matrix is refreshed by the renderer *after* this
    // callback, so reading `matrixWorldInverse` here would test the previous
    // frame's camera (a stale count whenever the view moves). Update it first.
    const camera = state.camera;
    camera.updateMatrixWorld();
    scratch.view.copy(camera.matrixWorld).invert();
    scratch.projection.multiplyMatrices(camera.projectionMatrix, scratch.view);
    scratch.frustum.setFromProjectionMatrix(scratch.projection);

    let visible = 0;
    for (const resident of sim.residents) {
      fillBody(resident, body);
      for (const transform of body) {
        const part = transform.part;
        const mesh = meshes.current[part];
        if (!mesh) continue;
        const slot = instanceSlot(resident.index, part, transform.slot);
        scratch.position.set(transform.x, transform.y, transform.z);
        scratch.scale.set(transform.sx, transform.sy, transform.sz);
        if (BODY_PRIMITIVE[part] === "cylinder") {
          scratch.yawQuaternion.setFromAxisAngle(scratch.up, transform.yaw);
          const axis = limbAxis(transform);
          scratch.direction.set(axis.x, axis.y, axis.z);
          scratch.quaternion.setFromUnitVectors(scratch.up, scratch.direction);
        } else {
          scratch.quaternion.copy(scratch.yawQuaternion.setFromAxisAngle(scratch.up, transform.yaw));
        }
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        mesh.setMatrixAt(slot, scratch.matrix);
      }

      scratch.point.set(resident.x, RESIDENTS.groundY + 0.9, resident.z);
      if (scratch.frustum.containsPoint(scratch.point)) visible += 1;
    }

    for (const part of BODY_PARTS) {
      const mesh = meshes.current[part];
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }

    // Highlight ring under the selected resident.
    const selected = getResidentSelection();
    const ring = highlight.current;
    if (ring) {
      const resident = selected !== null ? sim.residents[selected] : undefined;
      ring.visible = Boolean(resident);
      if (resident) ring.position.set(resident.x, RESIDENTS.groundY + 0.02, resident.z);
    }

    // Four reports a second, never one per frame.
    scratch.reportAt += delta;
    if (scratch.reportAt < 0.25) return;
    scratch.reportAt = 0;

    const counts: Record<Resident["state"], number> = { walking: 0, pausing: 0, interacting: 0, idle: 0 };
    for (const resident of sim.residents) counts[resident.state] += 1;

    scratch.sample.length = 0;
    for (const resident of sim.residents.slice(0, 4)) scratch.sample.push(describe(sim, resident));
    const focused = selected !== null ? sim.residents[selected] : undefined;

    publishResidentSnapshot({
      created: sim.residents.length,
      instances: sim.residents.length * BODY_INSTANCES,
      inFrustum: visible,
      walking: counts.walking,
      pausing: counts.pausing,
      interacting: counts.interacting,
      idle: counts.idle,
      conversationsStarted: sim.conversations.started,
      conversationsEnded: sim.conversations.ended,
      navFailures: sim.navFailures,
      unreachableMeetings: sim.unreachableMeetings,
      stuckRecoveries: sim.stuckRecoveries,
      errors: [],
      sceneDrawCalls: state.gl.info.render.calls,
      selected: focused ? describe(sim, focused) : null,
      sample: scratch.sample.slice(),
      running: isResidentRunning(),
      updatedAt: state.clock.elapsedTime,
    });
  });

  // Clicking a body selects it, so the panel can report its state and destination.
  const onPick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;
    setResidentSelection(event.instanceId);
  };

  return (
    <group ref={group} name="residents">
      {BODY_PARTS.map((part) => {
        const capacity = BODY_PART_COUNT[part] * Math.max(1, count);
        const geometry =
          part === "hair" ? assets.geometries.hair : BODY_PRIMITIVE[part] === "cylinder" ? assets.geometries.cylinder : assets.geometries.ellipsoid;
        return (
          <instancedMesh
            key={`${part}-${count}`}
            ref={(mesh) => {
              if (!mesh) return;
              meshes.current[part] = mesh;
              mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
              mesh.frustumCulled = false;
              mesh.count = capacity;
              // Allocate the colour buffer up front so the build pass can fill it.
              const white = new THREE.Color(0xffffff);
              for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, white);
              if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }}
            args={[geometry, assets.materials[PART_COLOUR[part]], capacity]}
            castShadow
            receiveShadow={false}
            onClick={part === "chest" ? onPick : undefined}
          />
        );
      })}

      <mesh ref={highlight} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={2}>
        <ringGeometry args={[0.34, 0.44, 28]} />
        <meshBasicMaterial color="#e8c46a" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}

function describe(sim: ResidentSim, resident: Resident): ResidentSample {
  const node = resident.route[resident.routeIndex];
  const target = node !== undefined ? sim.world.nodes[node] : undefined;
  return {
    id: resident.id,
    state: resident.state,
    activity: resident.activity,
    x: resident.x,
    z: resident.z,
    target: target ? `nó ${node} · (${target.x.toFixed(1)}, ${target.z.toFixed(1)})` : resident.spot ? "ponto de conversa" : "—",
    travelled: resident.travelled,
  };
}
