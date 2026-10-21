"use client";

import * as React from "react";
import { CLUBHOUSE, COURTS, SITE, courtBounds, type Court } from "@/lib/3d/site";
import { getMaterials } from "./materials";

/**
 * Sports park on the west side: a fenced 5-a-side football pitch, a
 * basketball court and a futsal court, plus the residents' pavilion and its
 * parking. Everything is procedural; markings are thin boxes laid 2 cm above
 * the playing surface so they never z-fight.
 */

const LINE = 0.09;

function Line({ x, z, length, rotation = 0 }: { x: number; z: number; length: number; rotation?: number }) {
  const m = getMaterials();
  return (
    <mesh position={[x, 0.045, z]} rotation={[-Math.PI / 2, 0, rotation]} material={m.courtLine}>
      <planeGeometry args={[length, LINE]} />
    </mesh>
  );
}

function Arc({
  x,
  z,
  radius,
  from = 0,
  to = Math.PI * 2,
}: {
  x: number;
  z: number;
  radius: number;
  from?: number;
  to?: number;
}) {
  const m = getMaterials();
  return (
    <mesh position={[x, 0.044, z]} rotation={[-Math.PI / 2, 0, 0]} material={m.courtLine}>
      <ringGeometry args={[radius - LINE / 2, radius + LINE / 2, 48, 1, from, to - from]} />
    </mesh>
  );
}

function Net({ x, z, width, height = 2, depth = 1.2, rotation = 0 }: { x: number; z: number; width: number; height?: number; depth?: number; rotation?: number }) {
  const m = getMaterials();
  const post = 0.06;
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * width) / 2, height / 2, 0]} material={m.metal} castShadow>
          <boxGeometry args={[post, height, post]} />
        </mesh>
      ))}
      <mesh position={[0, height, 0]} material={m.metal} castShadow>
        <boxGeometry args={[width + post, post, post]} />
      </mesh>
      {/* translucent net planes */}
      <mesh position={[0, height / 2, -depth / 2]} material={m.net}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <mesh position={[-width / 2, height / 2, -depth / 4]} rotation={[0, Math.PI / 2, 0]} material={m.net}>
        <planeGeometry args={[depth, height]} />
      </mesh>
      <mesh position={[width / 2, height / 2, -depth / 4]} rotation={[0, Math.PI / 2, 0]} material={m.net}>
        <planeGeometry args={[depth, height]} />
      </mesh>
    </group>
  );
}

function Floodlight({ x, z, night }: { x: number; z: number; night: boolean }) {
  const m = getMaterials();
  const heads = [-0.55, 0, 0.55];
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.6, 0]} material={m.metal} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 7.2, 8]} />
      </mesh>
      <mesh position={[0, 7.2, 0]} material={m.metal} castShadow>
        <boxGeometry args={[1.5, 0.1, 0.5]} />
      </mesh>
      {heads.map((offset) => (
        <mesh key={offset} position={[offset, 7.3, 0.12]} rotation={[0.35, 0, 0]} material={night ? m.lampGlass : m.courtLine}>
          <boxGeometry args={[0.44, 0.28, 0.14]} />
        </mesh>
      ))}
      {night && <pointLight position={[0, 7, 0]} intensity={5} distance={26} decay={2} color="#eaf2ff" />}
    </group>
  );
}

function Bench({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  const m = getMaterials();
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.44, 0]} material={m.timber} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.08, 0.48]} />
      </mesh>
      <mesh position={[0, 0.72, -0.22]} rotation={[0.18, 0, 0]} material={m.timber} castShadow>
        <boxGeometry args={[1.8, 0.34, 0.07]} />
      </mesh>
      {[-0.72, 0.72].map((offset) => (
        <mesh key={offset} position={[offset, 0.22, 0]} material={m.metal}>
          <boxGeometry args={[0.07, 0.44, 0.44]} />
        </mesh>
      ))}
    </group>
  );
}

/** Perimeter fence: posts, three rails and a translucent panel. */
function CourtFence({ court }: { court: Court }) {
  const m = getMaterials();
  const b = courtBounds(court);
  const height = 3.2;
  const runs = [
    { x: (b.minX + b.maxX) / 2, z: b.minZ, length: b.maxX - b.minX, rotation: 0 },
    { x: (b.minX + b.maxX) / 2, z: b.maxZ, length: b.maxX - b.minX, rotation: 0 },
    { x: b.minX, z: (b.minZ + b.maxZ) / 2, length: b.maxZ - b.minZ, rotation: Math.PI / 2 },
    { x: b.maxX, z: (b.minZ + b.maxZ) / 2, length: b.maxZ - b.minZ, rotation: Math.PI / 2 },
  ];
  return (
    <group>
      {runs.map((run, index) => {
        const posts = Math.max(2, Math.round(run.length / 3.4));
        return (
          <group key={index} position={[run.x, 0, run.z]} rotation={[0, run.rotation, 0]}>
            <mesh position={[0, height / 2, 0]} material={m.fence}>
              <planeGeometry args={[run.length, height]} />
            </mesh>
            {[0.1, height / 2, height - 0.1].map((y) => (
              <mesh key={y} position={[0, y, 0]} material={m.metal}>
                <boxGeometry args={[run.length, 0.06, 0.06]} />
              </mesh>
            ))}
            {Array.from({ length: posts + 1 }).map((_, post) => (
              <mesh key={post} position={[-run.length / 2 + (post * run.length) / posts, height / 2, 0]} material={m.metal} castShadow>
                <boxGeometry args={[0.09, height, 0.09]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function FootballPitch({ court, night }: { court: Court; night: boolean }) {
  const m = getMaterials();
  const w = court.width;
  const d = court.depth;
  const hw = w / 2;
  const hd = d / 2;
  return (
    <group position={[court.x, 0, court.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={m.pitch} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* boundary + halfway */}
      <Line x={0} z={-hd} length={w} />
      <Line x={0} z={hd} length={w} />
      <Line x={-hw} z={0} length={d} rotation={Math.PI / 2} />
      <Line x={hw} z={0} length={d} rotation={Math.PI / 2} />
      <Line x={0} z={0} length={w} />
      <Arc x={0} z={0} radius={3.2} />
      {/* penalty areas + goals at both ends */}
      {[-1, 1].map((end) => (
        <group key={end}>
          <Line x={0} z={end * (hd - 4.4)} length={w * 0.62} />
          <Line x={-(w * 0.62) / 2} z={end * (hd - 2.2)} length={4.4} rotation={Math.PI / 2} />
          <Line x={(w * 0.62) / 2} z={end * (hd - 2.2)} length={4.4} rotation={Math.PI / 2} />
          <Line x={0} z={end * (hd - 0.4)} length={2.4} />
          <Net x={0} z={end * (hd - 0.1)} width={3.2} height={2} rotation={end > 0 ? 0 : Math.PI} />
          <Floodlight x={end * (hw + 1.4)} z={end * (hd + 1.2)} night={night} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <Bench key={side} x={side * (hw + 1.5)} z={0} rotation={Math.PI / 2} />
      ))}
    </group>
  );
}

function BasketballCourt({ court, night }: { court: Court; night: boolean }) {
  const m = getMaterials();
  const w = court.width;
  const d = court.depth;
  const hw = w / 2;
  const hd = d / 2;
  return (
    <group position={[court.x, 0, court.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={m.courtClay} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>
      <Line x={0} z={-hd} length={w} />
      <Line x={0} z={hd} length={w} />
      <Line x={-hw} z={0} length={d} rotation={Math.PI / 2} />
      <Line x={hw} z={0} length={d} rotation={Math.PI / 2} />
      <Line x={0} z={0} length={w} />
      <Arc x={0} z={0} radius={1.9} />
      {[-1, 1].map((end) => {
        const rimZ = end * (hd - 1.55);
        const boardZ = end * (hd - 1.15);
        return (
          <group key={end}>
            {/* key + free-throw circle */}
            <Line x={-2.45} z={end * (hd - 2.9)} length={5.8} rotation={Math.PI / 2} />
            <Line x={2.45} z={end * (hd - 2.9)} length={5.8} rotation={Math.PI / 2} />
            <Line x={0} z={end * (hd - 5.8)} length={4.9} />
            <Arc x={0} z={end * (hd - 5.8)} radius={1.8} from={end > 0 ? 0 : Math.PI} to={end > 0 ? Math.PI : Math.PI * 2} />
            {/* three-point arc */}
            <Arc
              x={0}
              z={rimZ}
              radius={6.75}
              from={end > 0 ? Math.PI * 0.14 : Math.PI * 1.14}
              to={end > 0 ? Math.PI * 0.86 : Math.PI * 1.86}
            />
            {/* hoop */}
            <mesh position={[0, 1.05, end * (hd - 0.4)]} material={m.metal} castShadow>
              <boxGeometry args={[0.2, 2.1, 0.2]} />
            </mesh>
            <mesh position={[0, 3.05, boardZ]} material={m.white} castShadow>
              <boxGeometry args={[1.8, 1.05, 0.06]} />
            </mesh>
            <mesh position={[0, 3.05, boardZ]} material={m.courtLine}>
              <boxGeometry args={[0.6, 0.45, 0.07]} />
            </mesh>
            <mesh position={[0, 2.6, rimZ]} rotation={[Math.PI / 2, 0, 0]} material={m.metal}>
              <torusGeometry args={[0.23, 0.025, 8, 20]} />
            </mesh>
            {Array.from({ length: 8 }).map((_, index) => {
              const angle = (index / 8) * Math.PI * 2;
              return (
                <mesh
                  key={index}
                  position={[Math.cos(angle) * 0.2, 2.42, rimZ + Math.sin(angle) * 0.2]}
                  material={m.net}
                >
                  <planeGeometry args={[0.12, 0.32]} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      <Floodlight x={hw + 1.3} z={-hd + 1.2} night={night} />
      <Floodlight x={-hw - 1.3} z={hd - 1.2} night={night} />
      <Bench x={hw + 1.5} z={0} rotation={Math.PI / 2} />
    </group>
  );
}

function FutsalCourt({ court, night }: { court: Court; night: boolean }) {
  const m = getMaterials();
  const w = court.width;
  const d = court.depth;
  const hw = w / 2;
  const hd = d / 2;
  return (
    <group position={[court.x, 0, court.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={m.courtClay} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>
      <Line x={0} z={-hd} length={w} />
      <Line x={0} z={hd} length={w} />
      <Line x={-hw} z={0} length={d} rotation={Math.PI / 2} />
      <Line x={hw} z={0} length={d} rotation={Math.PI / 2} />
      <Line x={0} z={0} length={w} />
      <Arc x={0} z={0} radius={3} />
      {[-1, 1].map((end) => (
        <group key={end}>
          {/* 6 m penalty arc + spots */}
          <Arc x={0} z={end * (hd - 6)} radius={6} from={end > 0 ? Math.PI * 0.12 : Math.PI * 1.12} to={end > 0 ? Math.PI * 0.88 : Math.PI * 1.88} />
          <mesh position={[0, 0.045, end * (hd - 6)]} rotation={[-Math.PI / 2, 0, 0]} material={m.courtLine}>
            <circleGeometry args={[0.14, 10]} />
          </mesh>
          <mesh position={[0, 0.045, end * (hd - 10)]} rotation={[-Math.PI / 2, 0, 0]} material={m.courtLine}>
            <circleGeometry args={[0.14, 10]} />
          </mesh>
          <Net x={0} z={end * (hd - 0.1)} width={3} height={2} rotation={end > 0 ? 0 : Math.PI} />
          <Floodlight x={end * (hw + 1.3)} z={end * (hd + 1.1)} night={night} />
        </group>
      ))}
      <Bench x={-hw - 1.5} z={0} rotation={Math.PI / 2} />
    </group>
  );
}

function Clubhouse({ night }: { night: boolean }) {
  const m = getMaterials();
  const { x, z, width, depth } = CLUBHOUSE;
  return (
    <group position={[x, 0, z]}>
      {/* plinth + terrace */}
      <mesh position={[0, 0.09, 1.4]} material={m.concrete} receiveShadow castShadow>
        <boxGeometry args={[width + 3, 0.18, depth + 4.2]} />
      </mesh>
      {/* body */}
      <mesh position={[0, 1.8, -0.6]} material={m.render} castShadow receiveShadow>
        <boxGeometry args={[width, 3.2, depth]} />
      </mesh>
      {/* glazing on the terrace side */}
      <mesh position={[0, 1.75, depth / 2 - 0.56]} material={night ? m.glassNight : m.glassRail}>
        <boxGeometry args={[width - 1.4, 2.5, 0.12]} />
      </mesh>
      {/* roof + fascia */}
      <mesh position={[0, 3.5, -0.3]} material={m.charcoal} castShadow receiveShadow>
        <boxGeometry args={[width + 2.2, 0.28, depth + 2.6]} />
      </mesh>
      <mesh position={[0, 3.34, depth / 2 + 0.95]} material={m.timber} castShadow>
        <boxGeometry args={[width + 2.2, 0.16, 0.14]} />
      </mesh>
      {/* canopy over the terrace */}
      <mesh position={[0, 3.16, depth / 2 + 1.9]} material={m.timberDark} castShadow>
        <boxGeometry args={[width + 1.2, 0.16, 2.6]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (width + 0.9)) / 2, 1.55, depth / 2 + 2.9]} material={m.timber} castShadow>
          <boxGeometry args={[0.16, 3.1, 0.16]} />
        </mesh>
      ))}
      {/* timber screen detail */}
      {[-2.6, -1.3, 0, 1.3, 2.6].map((offset) => (
        <mesh key={offset} position={[offset, 1.9, depth / 2 - 0.48]} material={m.timberDark}>
          <boxGeometry args={[0.18, 2.9, 0.1]} />
        </mesh>
      ))}
      {night && <pointLight position={[0, 2.6, depth / 2 + 1.2]} intensity={3.4} distance={14} decay={2} color="#ffbe86" />}
      {/* parking apron with three marked bays */}
      <mesh position={[0, 0.03, depth / 2 + 4.5]} material={m.concrete} receiveShadow>
        <planeGeometry args={[width + 1, 6]} />
      </mesh>
      {[0, 1, 2, 3].map((index) => (
        <mesh key={index} position={[(index - 1.5) * 2.6, 0.05, depth / 2 + 4.5]} rotation={[-Math.PI / 2, 0, 0]} material={m.courtLine}>
          <planeGeometry args={[0.1, 4.4]} />
        </mesh>
      ))}
    </group>
  );
}

export function SportsPark({ night, lowQuality }: { night: boolean; lowQuality: boolean }) {
  const m = getMaterials();
  void m;
  const courtFor = (kind: Court["kind"]) => COURTS.find((court) => court.kind === kind)!;
  return (
    <group>
      {/* park lawn, mown a shade lighter than the meadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(SITE.sportsPark.minX + SITE.sportsPark.maxX) / 2, 0.012, (SITE.sportsPark.minZ + SITE.sportsPark.maxZ) / 2]} material={m.park} receiveShadow>
        <planeGeometry args={[SITE.sportsPark.maxX - SITE.sportsPark.minX, SITE.sportsPark.maxZ - SITE.sportsPark.minZ]} />
      </mesh>
      <FootballPitch court={courtFor("football")} night={night} />
      <BasketballCourt court={courtFor("basketball")} night={night} />
      <FutsalCourt court={courtFor("futsal")} night={night} />
      {!lowQuality && COURTS.map((court) => <CourtFence key={court.kind} court={court} />)}
      <Clubhouse night={night} />
      {/* apron where the service road meets the courts */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-62, 0.02, 15]} material={m.gravel} receiveShadow>
        <planeGeometry args={[8, 9]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-64, 0.02, 15]} material={m.gravel} receiveShadow>
        <planeGeometry args={[6, 5.5]} />
      </mesh>
    </group>
  );
}
