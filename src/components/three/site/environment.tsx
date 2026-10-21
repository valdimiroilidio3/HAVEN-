"use client";

import * as React from "react";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { lampPositions, plotFootprints } from "@/lib/3d/site";
import { getMaterials } from "../materials";

/** Every sixth lamp casts light; the rest are emissive meshes only. */
const LIT_LAMPS = 6;

/**
 * Light and atmosphere: the day/night themes, the sun rig, the moon, and the
 * street lighting that has to agree with the lamp placement rules.
 */

export const SUN_POSITION: [number, number, number] = [-70, 55, -90];
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
    fog: ["#cfd6d1", 180, 460],
    ambient: 0.3,
    hemisphere: 0.72,
    sun: SUN_POSITION,
    sunIntensity: 2.75,
    sunColor: "#ffe4bd",
    exposure: 1.04,
  },
  night: {
    background: "#0b1016",
    fog: ["#0b1016", 150, 400],
    ambient: 0.14,
    hemisphere: 0.22,
    sun: MOON_POSITION,
    sunIntensity: 0.7,
    sunColor: "#b9cbe8",
    exposure: 1.18,
  },
};


export function Exposure({ value }: { value: number }) {
  const gl = useThree((state) => state.gl);
  React.useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

export function Moon() {
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

export function StreetLamps({
  night,
  lowQuality,
  exclude,
}: {
  night: boolean;
  lowQuality: boolean;
  exclude: ReturnType<typeof plotFootprints>;
}) {
  const m = getMaterials();
  const lamps = React.useMemo(() => lampPositions(exclude), [exclude]);
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
          {night && !lowQuality && i % LIT_LAMPS === 0 && (
            <pointLight position={[0, 4.1, 0]} intensity={3.4} distance={14} decay={2} color="#ffbe83" />
          )}
        </group>
      ))}
    </group>
  );
}

export function Lighting({ lowQuality, time }: { lowQuality: boolean; time: TimeOfDay }) {
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
        shadow-mapSize-width={lowQuality ? 1024 : 3072}
        shadow-mapSize-height={lowQuality ? 1024 : 3072}
        shadow-camera-left={-118}
        shadow-camera-right={112}
        shadow-camera-top={96}
        shadow-camera-bottom={-92}
        shadow-camera-near={1}
        shadow-camera-far={420}
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
