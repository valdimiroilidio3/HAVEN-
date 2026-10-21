"use client";

import * as React from "react";
import { SITE } from "@/lib/3d/site";
import { POOL_COLORS } from "../vegetation";
import { getMaterials } from "../materials";

/**
 * The condominium lagoon: the scene's primary focal point after the houses.
 * Stone deck ring, tiled basin, submerged steps, loungers, parasols and an open
 * pavilion, all sized from `SITE.lagoon` so the validator can check that the
 * pavilion and furniture actually sit on the deck.
 */

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

export function Lagoon({ night, lowQuality }: { night: boolean; lowQuality: boolean }) {
  const m = getMaterials();
  const { x, z, radiusX, radiusZ, deck } = SITE.lagoon;
  const water = night ? m.waterNight : m.poolWater;
  const colors = night ? POOL_COLORS.night : POOL_COLORS.day;
  return (
    <group position={[x, 0, z]}>
      {/* stone deck: one ellipse under the water, so the rim reads as coping */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.07, 0]}
        scale={[radiusX + deck, radiusZ + deck, 1]}
        material={m.stone}
        receiveShadow
      />
      {/* basin: mosaic walls just under the rim */}
      <mesh position={[0, -0.34, 0]} scale={[radiusX + 0.22, 1, radiusZ + 0.22]} material={m.poolTile}>
        <cylinderGeometry args={[1, 1, 0.9, 96, 1, true]} />
      </mesh>
      <mesh position={[0, -0.36, 0]} scale={[radiusX, 1, radiusZ]} rotation={[-Math.PI / 2, 0, 0]} material={m.poolTile} receiveShadow>
        <circleGeometry args={[1, 96]} />
      </mesh>
      {/* water */}
      <mesh position={[0, 0.12, 0]} scale={[radiusX - 0.15, 1, radiusZ - 0.15]} rotation={[-Math.PI / 2, 0, 0]} material={water}>
        <circleGeometry args={[1, 96]} />
      </mesh>
      {/* stone steps down to the water on the south side */}
      {[0, 1, 2, 3].map((step) => (
        <mesh
          key={step}
          position={[0, -0.09 - step * 0.09, radiusZ + 0.5 - step * 0.28]}
          material={m.concrete}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[4.6, 0.1, 0.32]} />
        </mesh>
      ))}
      {/* sun-lounger row along the west rim, like a resort deck */}
      {!lowQuality &&
        [-3.4, -1.1, 1.2, 3.5, 5.8].map((offset, index) => (
          <Lounger key={offset} position={[-(radiusX + deck * 0.55), 0.08, offset + index * 0.1]} rotation={Math.PI / 2} />
        ))}
      {!lowQuality && <Parasol position={[-(radiusX + deck * 0.9), 0.08, -6.2]} />}
      {!lowQuality && <Parasol position={[-6, 0.08, -(radiusZ + deck * 0.62)]} />}
      {/* pavilion at the north end of the deck */}
      <group position={[SITE.pavilion.x, 0, SITE.pavilion.z]}>
        <mesh position={[0, 0.12, 0]} material={m.concrete} receiveShadow castShadow>
          <boxGeometry args={[SITE.pavilion.width + 1.6, 0.24, SITE.pavilion.depth + 2]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[(side * (SITE.pavilion.width - 0.8)) / 2, 1.85, 0]} material={m.timber} castShadow>
            <boxGeometry args={[0.18, 3.7, SITE.pavilion.depth - 0.6]} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`col-${side}`} position={[(side * (SITE.pavilion.width - 0.8)) / 2, 1.85, (SITE.pavilion.depth - 0.9) / 2]} material={m.timber} castShadow>
            <boxGeometry args={[0.16, 3.7, 0.16]} />
          </mesh>
        ))}
        <mesh position={[0, 3.82, 0]} material={m.timberDark} castShadow receiveShadow>
          <boxGeometry args={[SITE.pavilion.width + 1.5, 0.18, SITE.pavilion.depth + 1.6]} />
        </mesh>
        {Array.from({ length: 13 }).map((_, index) => (
          <mesh
            key={index}
            position={[-SITE.pavilion.width / 2 + 0.6 + index * ((SITE.pavilion.width - 1.2) / 12), 3.94, 0]}
            material={m.timber}
            castShadow
          >
            <boxGeometry args={[0.18, 0.12, SITE.pavilion.depth + 1.7]} />
          </mesh>
        ))}
        {night && <pointLight position={[0, 3.4, 0]} intensity={4} distance={16} decay={2} color="#ffcf9a" />}
      </group>
      {night && (
        <>
          <pointLight position={[0, 0.8, 0]} intensity={7} distance={30} decay={2} color={colors.water} />
          <mesh position={[0, 0.16, 0]} scale={[radiusX - 0.2, 1, radiusZ - 0.2]} rotation={[-Math.PI / 2, 0, 0]} material={m.poolLight}>
            <ringGeometry args={[0.86, 0.88, 96]} />
          </mesh>
        </>
      )}
    </group>
  );
}
