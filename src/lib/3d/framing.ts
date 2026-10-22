import { getFloorPlan } from "@/lib/domain/floorplans";
import type { Typology } from "@/lib/domain/types";

/**
 * Architectural framing.
 *
 * Computes camera positions from a house's **real** bounds and its **facing**,
 * never from a hand-tuned per-typology number and never from its absolute world
 * position. The previous rig derived its view direction from `focus.x/focus.z`
 * — the house's coordinates — so a house in the north row was photographed from
 * further north, i.e. from behind, looking at the rear garden wall.
 *
 * Pure functions: no three.js, no DOM. The rig consumes the numbers; tests
 * assert the geometry of the framing.
 */

export type ViewName = "hero" | "threeQuarter" | "facade" | "aerial" | "detail" | "context";

export interface HouseFootprint {
  /** Local width along X (the facade), in metres. */
  width: number;
  /** Local depth along Z, in metres. */
  depth: number;
  /** Ridge/parapet height above grade. */
  height: number;
}

export interface FrameInput {
  /** World position of the house centre. */
  position: { x: number; z: number };
  /** Rotation about Y, degrees. The house faces local +Z once rotated. */
  rotationY: number;
  footprint: HouseFootprint;
  /** Vertical field of view of the camera, degrees. */
  fov?: number;
}

export interface HouseFrame {
  /** Camera position. */
  position: { x: number; y: number; z: number };
  /** Look-at point. */
  target: { x: number; y: number; z: number };
}

/** Front direction in world space: local +Z rotated by `rotationY`. */
export function facadeNormal(rotationY: number): { x: number; z: number } {
  const rad = (rotationY * Math.PI) / 180;
  return { x: Math.sin(rad), z: Math.cos(rad) };
}

/**
 * How far the camera must stand for a subject of this radius to fit the frame,
 * with margin. Solves the vertical and horizontal half-angles and keeps the
 * larger requirement, so a wide house never overflows the frame.
 */
export function fitDistance(radius: number, fovDeg: number, aspect = 16 / 9, margin = 1.28): number {
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const halfAngle = Math.min(vertical, horizontal) / 2;
  return Math.max(radius * 1.4, (radius / Math.tan(halfAngle)) * margin);
}

/** Half-diagonal of the footprint: the radius a framing has to contain. */
export function houseRadius(footprint: HouseFootprint): number {
  return Math.hypot(footprint.width, footprint.depth) / 2;
}

/**
 * Named architectural views. Each one is a real presentation angle, not a
 * variation on one arbitrary spot:
 *
 *  hero         front, offset 22°, slightly above eye level — the identity shot
 *  threeQuarter 45° off the facade: two faces and the volume read together
 *  facade       square-on, low and centred: composition and alignment
 *  aerial       steep oblique: plot, access, roof and terrain
 *  detail       close on the entrance, at standing height
 *  context      far enough to place the house in the condominium
 */
const VIEWS: Record<
  ViewName,
  { angle: number; distance: number; height: number; targetHeight: number }
> = {
  // `distance` multiplies the distance at which the house just fits the frame.
  hero: { angle: 22, distance: 1.0, height: 0.55, targetHeight: 0.42 },
  threeQuarter: { angle: 48, distance: 1.05, height: 0.68, targetHeight: 0.4 },
  facade: { angle: 0, distance: 0.98, height: 0.34, targetHeight: 0.38 },
  aerial: { angle: 34, distance: 1.0, height: 1.9, targetHeight: 0.12 },
  detail: { angle: 12, distance: 0.42, height: 0.16, targetHeight: 0.2 },
  context: { angle: 26, distance: 2.5, height: 1.25, targetHeight: 0.4 },
};

export function houseFrame(input: FrameInput & { view?: ViewName }): HouseFrame {
  const view = VIEWS[input.view ?? "hero"];
  const { width, depth, height } = input.footprint;
  const radius = houseRadius(input.footprint);
  const fov = input.fov ?? 36;

  // Keep the camera outside the building, whatever the view: a hero shot from
  // too close on a 12 m deep house would end up in the living room.
  const clearance = Math.max(width, depth) / 2 + 2.6;

  // Rotate the front normal by the view angle, so every view is measured from
  // the facade rather than from world north.
  const angle = ((input.rotationY + view.angle) * Math.PI) / 180;
  const dir = { x: Math.sin(angle), z: Math.cos(angle) };

  // Distance at which the house fits the frame, then the view's own factor.
  const along = Math.max(fitDistance(radius, fov) * view.distance, clearance);
  // Eye height: a fixed fraction of the volume, never below standing height, so
  // a bungalow is not photographed from 15 cm and a two-storey house is not cut.
  const eyeY = Math.max(2.2, height * view.height + 1.4);
  return {
    position: {
      x: input.position.x + dir.x * along,
      y: eyeY,
      z: input.position.z + dir.z * along,
    },
    target: {
      x: input.position.x,
      y: height * view.targetHeight + 0.6,
      z: input.position.z,
    },
  };
}

/** Footprint used for framing, taken from the plan the house was built from. */
export function footprintFor(typology: Typology, headerHeight: number): HouseFootprint {
  const plan = getFloorPlan(typology);
  return { width: plan.widthM, depth: plan.depthM, height: headerHeight };
}

/** Convenience: the hero frame for a house, the view a selection lands on. */
export function heroFrame(input: FrameInput): HouseFrame {
  return houseFrame({ ...input, view: "hero" });
}
