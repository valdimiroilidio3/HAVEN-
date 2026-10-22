/**
 * The resident skeleton.
 *
 * One authoritative description of where every piece of a body sits, shared by
 * the renderer (which writes these transforms into instanced matrices) and by
 * `scripts/render-residents.ts` (which rasterises the same transforms to a PNG
 * so the population can be inspected without a browser).
 *
 * Pure: no three.js, no React, no allocation inside the hot path — the caller
 * supplies the output array and each entry is filled in place.
 */
import { poseFor, RESIDENTS, type Resident } from "./residents";

export type BodyPartName =
  | "head"
  | "hair"
  | "eye"
  | "chest"
  | "hips"
  | "armUpper"
  | "armLower"
  | "legUpper"
  | "legLower"
  | "shoe";

/** How many instances of each part one body uses. */
export const BODY_PART_COUNT: Record<BodyPartName, number> = {
  head: 3, // skull, nose, neck
  hair: 1,
  eye: 2,
  chest: 1,
  hips: 1,
  armUpper: 2,
  armLower: 2,
  legUpper: 2,
  legLower: 2,
  shoe: 2,
};

/** Parts in draw order. */
export const BODY_PARTS: BodyPartName[] = [
  "head",
  "hair",
  "eye",
  "chest",
  "hips",
  "armUpper",
  "armLower",
  "legUpper",
  "legLower",
  "shoe",
];

/** Primitive a part is drawn with: an ellipsoid or a cylinder along its axis. */
export type Primitive = "ellipsoid" | "cylinder";

export const BODY_PRIMITIVE: Record<BodyPartName, Primitive> = {
  head: "ellipsoid",
  hair: "ellipsoid",
  eye: "ellipsoid",
  chest: "ellipsoid",
  hips: "ellipsoid",
  armUpper: "cylinder",
  armLower: "cylinder",
  legUpper: "cylinder",
  legLower: "cylinder",
  shoe: "ellipsoid",
};

export const PART_COLOUR: Record<BodyPartName, "skin" | "hair" | "shirt" | "trousers" | "shoe" | "eye"> = {
  head: "skin",
  hair: "hair",
  eye: "eye",
  chest: "shirt",
  hips: "trousers",
  armUpper: "shirt",
  armLower: "skin",
  legUpper: "trousers",
  legLower: "trousers",
  shoe: "shoe",
};

/** Skeleton, metres, for a 1.78 m adult. Scaled per resident by height. */
export const SKELETON = {
  hipY: 0.92,
  shoulderY: 1.44,
  headY: 1.63,
  hipHalf: 0.095,
  shoulderHalf: 0.2,
  thigh: 0.45,
  shin: 0.42,
  upperArm: 0.29,
  forearm: 0.26,
  chestHalfWidth: 0.188,
  chestHalfHeight: 0.245,
  chestHalfDepth: 0.115,
  hipHalfWidth: 0.155,
  hipHalfHeight: 0.115,
  hipHalfDepth: 0.105,
} as const;

export const HEIGHT_REFERENCE = 1.78;

export interface BodyTransform {
  part: BodyPartName;
  /** Centre of the primitive. */
  x: number;
  y: number;
  z: number;
  /** Half-extents for an ellipsoid; (radius, length, radius) for a cylinder. */
  sx: number;
  sy: number;
  sz: number;
  /** Rotation about Y, radians. */
  yaw: number;
  /** Tilt of a cylinder about the body's right axis, radians (positive forward). */
  tilt: number;
  /** Instance slot within its part: 0, or 0/1 for paired limbs. */
  slot: number;
}

/**
 * GPU instance index for one part of one body.
 *
 * Each part mesh holds `BODY_PART_COUNT[part]` instances per resident, so the
 * body index has to multiply — writing every body into slots 0..n-1 would stack
 * the whole population inside a single person.
 */
export function instanceSlot(residentIndex: number, part: BodyPartName, partSlot: number): number {
  return residentIndex * BODY_PART_COUNT[part] + partSlot;
}

/** One transform per part instance: 18 per body. */
export const BODY_INSTANCES = BODY_PARTS.reduce((total, part) => total + BODY_PART_COUNT[part], 0);

export function createBodyBuffer(): BodyTransform[] {
  const buffer: BodyTransform[] = [];
  for (const part of BODY_PARTS) {
    for (let i = 0; i < BODY_PART_COUNT[part]; i += 1) {
      buffer.push({ part, x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0, yaw: 0, tilt: 0, slot: i });
    }
  }
  return buffer;
}

/**
 * Fill `out` with the transforms for one resident, in body-local world space.
 * Returns the number of instances written (always `BODY_INSTANCES`).
 */
export function fillBody(resident: Resident, out: BodyTransform[]): number {
  const pose = poseFor(resident);
  const style = resident.style;
  const s = style.height / HEIGHT_REFERENCE;
  const wide = style.build;
  const yaw = resident.rotationY;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const bob = pose.bob;
  const baseY = RESIDENTS.groundY;
  const interacting = resident.state === "interacting";

  const hipY = baseY + (SKELETON.hipY + bob) * s;
  const shoulderY = baseY + (SKELETON.shoulderY + bob) * s;
  const lean = pose.lean * 0.09 * s;
  let cursor = 0;
  const slots: Partial<Record<BodyPartName, number>> = {};

  const put = (
    part: BodyPartName,
    lx: number,
    ly: number,
    lz: number,
    sx: number,
    sy: number,
    sz: number,
    tilt = 0,
  ) => {
    const target = out[cursor];
    if (!target) {
      cursor += 1;
      return;
    }
    // Local (body) coordinates -> world. The body faces +Z at yaw 0.
    target.part = part;
    target.x = resident.x + lx * cos + lz * sin;
    target.z = resident.z - lx * sin + lz * cos;
    target.y = ly;
    target.sx = sx;
    target.sy = sy;
    target.sz = sz;
    target.yaw = yaw;
    target.tilt = tilt;
    const slot = slots[part] ?? 0;
    slots[part] = slot + 1;
    target.slot = slot;
    cursor += 1;
  };

  // --- head and hair ------------------------------------------------------
  const headRadius = 0.102 * s;
  const headY = baseY + (SKELETON.headY + bob) * s;
  put("head", 0, headY, lean * 0.6, headRadius, headRadius * 1.15, headRadius * 1.04);
  // Nose: a small bump on the face side (+Z), so which way a body faces is
  // readable at a glance. Geometry only — no facial expression is animated.
  put("head", 0, headY - 0.012 * s, lean * 0.6 + headRadius * 0.94, headRadius * 0.2, headRadius * 0.24, headRadius * 0.3);
  put("hair", 0, headY + headRadius * 0.16, lean * 0.6 - 0.008 * s, headRadius * 1.06, headRadius * 1.14, headRadius * 1.09);
  // Neck: without it the head floats above the shoulders.
  put("head", 0, shoulderY + 0.03 * s, lean * 0.8, headRadius * 0.46, headRadius * 0.62, headRadius * 0.44);
  for (const side of [-1, 1] as const) {
    put("eye", side * headRadius * 0.42, headY + headRadius * 0.16, lean * 0.6 + headRadius * 0.88, headRadius * 0.15, headRadius * 0.13, headRadius * 0.1);
  }

  // --- chest and hips -----------------------------------------------------
  put(
    "chest",
    0,
    (shoulderY + hipY) / 2 + 0.055 * s,
    lean,
    SKELETON.chestHalfWidth * wide * s,
    SKELETON.chestHalfHeight * 1.06 * s,
    SKELETON.chestHalfDepth * wide * s,
  );
  put("hips", 0, hipY + 0.015 * s, 0, SKELETON.hipHalfWidth * s, SKELETON.hipHalfHeight * s, SKELETON.hipHalfDepth * s);

  // --- legs ---------------------------------------------------------------
  for (const [side, legAngle] of [[-1, pose.legL], [1, pose.legR]] as const) {
    const hipX = side * SKELETON.hipHalf * s;
    const thighLength = SKELETON.thigh * s;
    const kneeY = hipY - Math.cos(legAngle) * thighLength;
    const kneeForward = Math.sin(legAngle) * thighLength;
    put(
      "legUpper",
      hipX,
      (hipY + kneeY) / 2,
      kneeForward / 2,
      0.068 * s,
      thighLength,
      0.068 * s,
      legAngle,
    );

    const shinAngle = legAngle * 0.55;
    const shinLength = SKELETON.shin * s;
    const ankleY = kneeY - Math.cos(shinAngle) * shinLength;
    const shinForward = kneeForward + Math.sin(shinAngle) * shinLength;
    put(
      "legLower",
      hipX,
      (kneeY + ankleY) / 2,
      kneeForward + (Math.sin(shinAngle) * shinLength) / 2,
      0.052 * s,
      shinLength,
      0.052 * s,
      shinAngle,
    );

    // Shoe: flat on the ground, pointing forward.
    put("shoe", hipX, baseY + 0.042 * s, shinForward + 0.045 * s, 0.062 * s, 0.042 * s, 0.105 * s);
  }

  // --- arms ---------------------------------------------------------------
  for (const [side, armAngle, armOut] of [[-1, pose.armL, pose.armOutL], [1, pose.armR, pose.armOutR]] as const) {
    // The shoulder joint sits just inside the chest, so the arm touches the
    // torso instead of floating beside it.
    const shoulderX = side * (SKELETON.chestHalfWidth * wide * 0.92 + 0.03) * s + side * armOut * 0.06 * s;
    const jointY = shoulderY - 0.07 * s;
    const upperLength = SKELETON.upperArm * s;
    const elbowY = jointY - Math.cos(armAngle) * upperLength;
    const elbowForward = Math.sin(armAngle) * upperLength;
    put("armUpper", shoulderX, (jointY + elbowY) / 2, elbowForward / 2, 0.05 * s, upperLength, 0.05 * s, armAngle);

    // The forearm bends forward: that bend is what makes a standing figure read
    // as a person rather than as a post.
    const forearmAngle = armAngle + (interacting ? 0.5 : 0.12);
    const forearmLength = SKELETON.forearm * s;
    const handY = elbowY - Math.cos(forearmAngle) * forearmLength;
    put(
      "armLower",
      shoulderX,
      (elbowY + handY) / 2,
      elbowForward + (Math.sin(forearmAngle) * forearmLength) / 2,
      0.038 * s,
      forearmLength,
      0.038 * s,
      forearmAngle,
    );
  }

  return cursor;
}

/**
 * World-space axis of a cylinder part, for renderers and rasterisers: a limb is
 * drawn along its own `tilt` about the body's right axis, then turned by `yaw`.
 */
export function limbAxis(transform: BodyTransform): { x: number; y: number; z: number } {
  const dirY = -Math.cos(transform.tilt);
  const dirZ = Math.sin(transform.tilt);
  return {
    x: dirZ * Math.sin(transform.yaw),
    y: dirY,
    z: dirZ * Math.cos(transform.yaw),
  };
}
