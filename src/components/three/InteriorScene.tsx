"use client";

import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getFloorPlan, type FloorPlan, type PlanRoom } from "@/lib/domain/floorplans";
import { deriveOpenings, deriveWalls } from "@/lib/domain/plan-geometry";
import type { Typology } from "@/lib/domain/types";
import { getInteriorMaterials } from "./materials";
import type { PoolSpec } from "@/lib/3d/site";
import { Furniture3D } from "./Furniture3D";

/**
 * Real interior geometry: carved walls, glazing, doors, floors and furniture
 * generated from the same plan specification as the 2D drawing. No camera
 * trickery — the walls have genuine openings, and the prototype is open above
 * for the dollhouse view.
 */

function InteriorLighting({ plan, quality, night }: { plan: FloorPlan; quality: "low" | "high"; night: boolean }) {
  return (
    <>
      <ambientLight intensity={night ? 0.2 : 0.55} color={night ? "#94a6c4" : "#f3efe6"} />
      <hemisphereLight args={[night ? "#2f3a52" : "#dfe6ea", night ? "#241f18" : "#8b826d", night ? 0.24 : 0.6]} />
      <directionalLight
        position={[plan.widthM * 0.8, 22, -plan.depthM * 1.2]}
        intensity={night ? 0.55 : 3.1}
        color={night ? "#9fb4d8" : "#ffe7c4"}
        castShadow
        shadow-mapSize-width={quality === "high" ? 2048 : 1024}
        shadow-mapSize-height={quality === "high" ? 2048 : 1024}
        shadow-camera-left={-plan.widthM}
        shadow-camera-right={plan.widthM}
        shadow-camera-top={plan.depthM}
        shadow-camera-bottom={-plan.depthM}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-14, 12, 10]} intensity={night ? 0.18 : 0.6} color="#cfd9e0" />
      <pointLight position={[plan.widthM * 0.2, 2.6, -plan.depthM * 0.2]} intensity={night ? 11 : 6} distance={night ? 12 : 9} color="#ffd9a8" />
      <pointLight position={[-plan.widthM * 0.25, 2.6, plan.depthM * 0.2]} intensity={night ? 8 : 4} distance={night ? 11 : 8} color="#ffe2b8" />
      {night && <pointLight position={[0, 2.4, plan.depthM * 0.35]} intensity={5} distance={9} color="#ffcf9a" />}
    </>
  );
}

function RoomFloors({ plan, materials }: { plan: FloorPlan; materials: ReturnType<typeof getInteriorMaterials> }) {
  return (
    <group>
      {plan.rooms.map((room) => {
        const w = room.x2 - room.x1;
        const d = room.z2 - room.z1;
        const material =
          room.kind === "bathroom" || room.kind === "wc" || room.kind === "laundry" || room.kind === "storage"
            ? materials.tile
            : room.kind === "kitchen"
              ? materials.stone
              : materials.oak;
        return (
          <mesh key={room.id} position={[(room.x1 + room.x2) / 2, -0.03, (room.z1 + room.z2) / 2]} material={material} receiveShadow>
            <boxGeometry args={[w, 0.06, d]} />
          </mesh>
        );
      })}
      {plan.terraces.map((terrace) => {
        const w = terrace.x2 - terrace.x1;
        const d = terrace.z2 - terrace.z1;
        return (
          <mesh
            key={terrace.id}
            position={[(terrace.x1 + terrace.x2) / 2, 0.02, (terrace.z1 + terrace.z2) / 2]}
            material={terrace.deck === "timber" ? materials.oak : materials.stone}
            receiveShadow
          >
            <boxGeometry args={[w, 0.1, d]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Walls({ plan, cutaway, materials }: { plan: FloorPlan; cutaway: boolean; materials: ReturnType<typeof getInteriorMaterials> }) {
  const walls = React.useMemo(() => deriveWalls(plan), [plan]);
  const cutHeight = 1.15;
  return (
    <group>
      {walls.map((wall) =>
        wall.components.map((component, i) => {
          if (cutaway && component.bottom > cutHeight - 0.05) return null;
          const top = cutaway ? Math.min(component.top, cutHeight) : component.top;
          const height = top - component.bottom;
          const span = component.end - component.start;
          if (height <= 0.01 || span <= 0.01) return null;
          const position: [number, number, number] =
            wall.orientation === "h"
              ? [(component.start + component.end) / 2, component.bottom + height / 2, wall.at]
              : [wall.at, component.bottom + height / 2, (component.start + component.end) / 2];
          const size: [number, number, number] =
            wall.orientation === "h" ? [span, height, wall.thickness] : [wall.thickness, height, span];
          return (
            <mesh key={`${wall.id}-${i}`} position={position} material={wall.exterior ? materials.wallWarm : materials.wall} castShadow receiveShadow>
              <boxGeometry args={size} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

function Openings({ plan, cutaway, materials }: { plan: FloorPlan; cutaway: boolean; materials: ReturnType<typeof getInteriorMaterials> }) {
  const openings = React.useMemo(() => deriveOpenings(plan), [plan]);
  return (
    <group>
      {openings.map((opening) => {
        const isH = opening.orientation === "h";
        const height = opening.top - opening.bottom;
        const midY = (opening.top + opening.bottom) / 2;
        const width = opening.end - opening.start;
        const position: [number, number, number] = isH
          ? [(opening.start + opening.end) / 2, midY, opening.at]
          : [opening.at, midY, (opening.start + opening.end) / 2];
        const rotation: [number, number, number] = isH ? [0, 0, 0] : [0, Math.PI / 2, 0];

        if (opening.glass) {
          return (
            <group key={opening.id} position={position} rotation={rotation}>
              <mesh material={materials.glass}>
                <boxGeometry args={[width - 0.04, height - 0.04, 0.02]} />
              </mesh>
              <mesh position={[0, height / 2, 0]} material={materials.charcoal}>
                <boxGeometry args={[width, 0.05, 0.08]} />
              </mesh>
              <mesh position={[0, -height / 2, 0]} material={materials.charcoal}>
                <boxGeometry args={[width, 0.05, 0.08]} />
              </mesh>
              <mesh position={[-width / 2, 0, 0]} material={materials.charcoal}>
                <boxGeometry args={[0.05, height, 0.08]} />
              </mesh>
              <mesh position={[width / 2, 0, 0]} material={materials.charcoal}>
                <boxGeometry args={[0.05, height, 0.08]} />
              </mesh>
              {[0.33, 0.66].map((t) => (
                <mesh key={t} position={[-width / 2 + width * t, 0, 0]} material={materials.charcoal}>
                  <boxGeometry args={[0.03, height, 0.06]} />
                </mesh>
              ))}
            </group>
          );
        }

        const isEntry = opening.id.includes("entry");
        const doorHeight = Math.min(2.15, height);
        const doorWidth = width - 0.06;
        const sign = isH ? (opening.at > 0 ? 1 : -1) : opening.at > 0 ? -1 : 1;
        return (
          <group key={opening.id}>
            {/* frame */}
            <group position={position} rotation={rotation}>
              <mesh position={[-width / 2, doorHeight / 2 - midY + 0.01, 0]} material={materials.walnut}>
                <boxGeometry args={[0.06, doorHeight, 0.2]} />
              </mesh>
              <mesh position={[width / 2, doorHeight / 2 - midY + 0.01, 0]} material={materials.walnut}>
                <boxGeometry args={[0.06, doorHeight, 0.2]} />
              </mesh>
              <mesh position={[0, doorHeight + 0.03 - midY, 0]} material={materials.walnut}>
                <boxGeometry args={[width, 0.08, 0.2]} />
              </mesh>
            </group>
            {/* leaf, opened into the room */}
            <group
              position={isH ? [opening.start + 0.03, 0, opening.at] : [opening.at, 0, opening.start + 0.03]}
              rotation={[0, isH ? (Math.PI / 2) * 0.78 * sign : Math.PI / 2 + (Math.PI / 2) * 0.78 * sign, 0]}
            >
              <mesh position={[doorWidth / 2, doorHeight / 2, 0]} material={isEntry ? materials.walnut : materials.oak} castShadow>
                <boxGeometry args={[doorWidth, doorHeight, 0.045]} />
              </mesh>
              <mesh position={[doorWidth * 0.86, doorHeight * 0.5, 0.045]} material={materials.steel} castShadow={false}>
                <boxGeometry args={[0.02, 0.2, 0.02]} />
              </mesh>
            </group>
          </group>
        );
      })}
      {!cutaway && null}
    </group>
  );
}

function Ceilings({ plan, materials }: { plan: FloorPlan; materials: ReturnType<typeof getInteriorMaterials> }) {
  return (
    <group>
      {plan.rooms.map((room) => (
        <mesh
          key={room.id}
          position={[(room.x1 + room.x2) / 2, plan.wallHeightM + 0.03, (room.z1 + room.z2) / 2]}
          material={materials.wall}
          receiveShadow
        >
          <boxGeometry args={[room.x2 - room.x1 + 0.02, 0.06, room.z2 - room.z1 + 0.02]} />
        </mesh>
      ))}
    </group>
  );
}

function Garden({
  plan,
  materials,
  pool,
  night,
}: {
  plan: FloorPlan;
  materials: ReturnType<typeof getInteriorMaterials>;
  pool: PoolSpec | null;
  night: boolean;
}) {
  const grass = React.useMemo(() => new THREE.MeshStandardMaterial({ color: night ? "#3d462f" : "#7c8c5e", roughness: 1 }), [night]);
  const water = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: night ? "#12333d" : "#4f9fae",
        emissive: night ? new THREE.Color("#1d7c93") : new THREE.Color("#000000"),
        emissiveIntensity: night ? 0.5 : 0,
        roughness: 0.07,
        metalness: 0.55,
        transparent: true,
        opacity: 0.92,
      }),
    [night],
  );
  const light = React.useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#8ee0ff", toneMapped: false }),
    [],
  );
  React.useEffect(
    () => () => {
      grass.dispose();
      water.dispose();
      light.dispose();
    },
    [grass, water, light],
  );
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} material={grass} receiveShadow>
        <planeGeometry args={[160, 160]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (plan.widthM / 2 + 5), 0.7, -plan.depthM / 2 - 3]} material={materials.plant} castShadow>
          <boxGeometry args={[2.2, 1.5, 9]} />
        </mesh>
      ))}
      {pool && (
        <group position={[pool.x, 0, pool.z]}>
          <mesh position={[0, -0.03, 0]} material={materials.stone} receiveShadow>
            <boxGeometry args={[pool.width + pool.deck * 2, 0.14, pool.depth + pool.deck * 2]} />
          </mesh>
          <mesh position={[0, 0.06, 0]} material={water}>
            <boxGeometry args={[pool.width, 0.08, pool.depth]} />
          </mesh>
          {[0, 1, 2].map((step) => (
            <mesh key={step} position={[-pool.width / 2 + 0.35 + step * 0.32, 0.02 - step * 0.05, -pool.depth / 2 + 0.5]} material={materials.stone} receiveShadow>
              <boxGeometry args={[0.32, 0.05 + step * 0.1, 1.0]} />
            </mesh>
          ))}
          {night && (
            <>
              <mesh position={[-pool.width / 2 + 0.05, 0.02, 0]} material={light}>
                <boxGeometry args={[0.04, 0.1, pool.depth * 0.55]} />
              </mesh>
              <mesh position={[pool.width / 2 - 0.05, 0.02, 0]} material={light}>
                <boxGeometry args={[0.04, 0.1, pool.depth * 0.55]} />
              </mesh>
            </>
          )}
        </group>
      )}
      <mesh position={[plan.widthM * 0.3, 2.6, -plan.depthM * 0.9]} material={materials.plant} castShadow>
        <icosahedronGeometry args={[2.2, 1]} />
      </mesh>
      <mesh position={[plan.widthM * 0.3, 1.2, -plan.depthM * 0.9]} material={materials.walnut} castShadow>
        <cylinderGeometry args={[0.14, 0.22, 2.4, 7]} />
      </mesh>
    </group>
  );
}

function CameraRig({
  plan,
  focus,
  walkMode,
  controlsRef,
}: {
  plan: FloorPlan;
  focus: { x: number; z: number; key: number };
  walkMode: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const destination = React.useRef(new THREE.Vector3());
  const lookAt = React.useRef(new THREE.Vector3());
  const animating = React.useRef(true);

  React.useEffect(() => {
    if (walkMode) {
      lookAt.current.set(focus.x, 1.35, focus.z);
      destination.current.set(focus.x + plan.widthM * 0.28, 2.05, focus.z + Math.max(3.2, plan.depthM * 0.32));
    } else {
      lookAt.current.set(0, 0.4, 0);
      destination.current.set(plan.widthM * 0.72, plan.widthM * 0.95 + 7, plan.depthM * 0.9 + 5);
    }
    animating.current = true;
  }, [focus, walkMode, plan.widthM, plan.depthM]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    const controls = controlsRef.current;
    const alpha = 1 - Math.exp(-4.2 * Math.min(delta, 0.1));
    camera.position.lerp(destination.current, alpha);
    if (controls) {
      controls.target.lerp(lookAt.current, alpha);
      controls.update();
    }
    if (camera.position.distanceTo(destination.current) < 0.12) animating.current = false;
  });

  return null;
}

export interface InteriorSceneProps {
  typology: Typology;
  focusRoomId: string | null;
  walkMode: boolean;
  showFurniture: boolean;
  showAppliances?: boolean;
  /** Continuous 360° orbit around the selected focus. */
  spin?: boolean;
  timeOfDay?: "day" | "night";
  /** Private pool of this unit, rendered in the garden when present. */
  pool?: PoolSpec | null;
  quality?: "low" | "high";
  onRoomSelect?: (room: PlanRoom) => void;
}

export function InteriorScene({
  typology,
  focusRoomId,
  walkMode,
  showFurniture,
  showAppliances = true,
  spin = false,
  timeOfDay = "day",
  pool = null,
  quality = "high",
}: InteriorSceneProps) {
  const plan = React.useMemo(() => getFloorPlan(typology), [typology]);
  const materials = getInteriorMaterials();
  const controlsRef = React.useRef<OrbitControlsImpl | null>(null);
  const [focus, setFocus] = React.useState({ x: 0, z: 0, key: 0 });

  React.useEffect(() => {
    const room = plan.rooms.find((r) => r.id === focusRoomId);
    if (room) {
      setFocus({
        x: (room.x1 + room.x2) / 2,
        z: (room.z1 + room.z2) / 2,
        key: Date.now(),
      });
    } else {
      setFocus({ x: 0, z: 0, key: Date.now() });
    }
  }, [focusRoomId, plan.rooms]);

  const cutaway = !walkMode;
  const night = timeOfDay === "night";

  return (
    <>
      <color attach="background" args={[night ? "#141a22" : "#cfd6d2"]} />
      <fog attach="fog" args={[night ? "#141a22" : "#cfd6d2", night ? 40 : 60, night ? 130 : 160]} />
      <InteriorLighting plan={plan} quality={quality} night={night} />
      <Garden plan={plan} materials={materials} pool={pool} night={night} />
      <RoomFloors plan={plan} materials={materials} />
      <Walls plan={plan} cutaway={cutaway} materials={materials} />
      <Openings plan={plan} cutaway={cutaway} materials={materials} />
      {!cutaway && <Ceilings plan={plan} materials={materials} />}
      {showFurniture && (
        <group>
          {plan.furniture.map((piece) => (
            <Furniture3D key={piece.id} piece={piece} showAppliances={showAppliances} />
          ))}
        </group>
      )}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={walkMode ? 1.2 : 6}
        maxDistance={walkMode ? 9 : 48}
        maxPolarAngle={walkMode ? 1.52 : Math.PI / 2.2}
        minPolarAngle={walkMode ? 0.9 : 0.15}
        target={[0, walkMode ? 1.35 : 0.4, 0]}
        autoRotate={spin}
        autoRotateSpeed={1.1}
        makeDefault
      />
      <CameraRig plan={plan} focus={focus} walkMode={walkMode} controlsRef={controlsRef} />
    </>
  );
}
