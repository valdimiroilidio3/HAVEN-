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
  | "shoe"
  | "hand";

/** How many instances of each part one body uses. */
export const BODY_PART_COUNT: Record<BodyPartName, number> = {
  head: 3, // skull, nose, neck
  hair: 2, // cap of hair, plus a long panel that is shrunk for short hair
  eye: 2,
  chest: 2, // body of the jacket, plus the shoulder line
  hips: 1,
  armUpper: 2,
  armLower: 2,
  legUpper: 2,
  legLower: 2,
  shoe: 2,
  hand: 2,
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
  "hand",
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
  hand: "ellipsoid",
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
  hand: "skin",
};

/** Skeleton, metres, for a 1.78 m adult. Scaled per resident by height. */
export const SKELETON = {
  hipY: 0.92,
  shoulderY: 1.44,
  headY: 1.6,
  hipHalf: 0.095,
  shoulderHalf: 0.2,
  thigh: 0.45,
  shin: 0.42,
  upperArm: 0.29,
  forearm: 0.26,
  chestHalfWidth: 0.176,
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
  /** Splay of a cylinder about the body's forward axis, radians (positive = right). */
  lean: number;
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

/**
 * Which resident a picked instance belongs to.
 *
 * A part can hold several instances per body (two hands, two chest pieces), so
 * the raw instance index is not the resident index. Clicking the chest of the
 * third person returns instance 4 and must select resident 2.
 */
export function residentAtInstance(part: BodyPartName, instanceId: number): number {
  return Math.floor(instanceId / BODY_PART_COUNT[part]);
}

export function createBodyBuffer(): BodyTransform[] {
  const buffer: BodyTransform[] = [];
  for (const part of BODY_PARTS) {
    for (let i = 0; i < BODY_PART_COUNT[part]; i += 1) {
      buffer.push({ part, x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0, yaw: 0, tilt: 0, lean: 0, slot: i });
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
  // Gait: not everyone swings their limbs the same distance.
  const gait = style.gait;

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
    lean = 0,
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
    target.lean = lean;
    const slot = slots[part] ?? 0;
    slots[part] = slot + 1;
    target.slot = slot;
    cursor += 1;
  };

  const walking = resident.state === "walking";
  const legs = ([[-1, pose.legL, resident.stride], [1, pose.legR, resident.stride + Math.PI]] as const).map(
    ([side, legPose, phase]) => {
      const angle = legPose * gait;
      // Standing still, both feet are on the ground; only a gait lifts one.
      const swing = walking ? Math.max(0, Math.cos(phase)) : 0;
      const shinAngle = angle * 0.55 + swing * 0.7;
      const kneeY = hipY - Math.cos(angle) * SKELETON.thigh * s;
      const ankleY = kneeY - Math.cos(shinAngle) * SKELETON.shin * s;
      const kneeForward = Math.sin(angle) * SKELETON.thigh * s;
      const shinForward = kneeForward + Math.sin(shinAngle) * SKELETON.shin * s;
      return { side, angle, shinAngle, kneeY, ankleY, kneeForward, shinForward, sole: ankleY - 0.05 * s };
    },
  );
  // The body sits as low as the lowest foot requires, never below the path.
  const lowestSole = Math.min(...legs.map((leg) => leg.sole));
  const shift = baseY - lowestSole;

  // --- head and hair ------------------------------------------------------
  const headRadius = 0.105 * s;
  const headY = baseY + (SKELETON.headY + bob) * s;
  put("head", 0, headY + shift, lean * 0.6, headRadius, headRadius * 1.15, headRadius * 1.04);
  // Nose: a small bump on the face side (+Z), so which way a body faces is
  // readable at a glance. Geometry only — no facial expression is animated.
  put("head", 0, headY - 0.016 * s + shift, lean * 0.6 + headRadius * 0.9, headRadius * 0.17, headRadius * 0.2, headRadius * 0.24);
  // Hair: a cap over the skull, plus a panel down the back that only exists for
  // the long style. A bald head simply shrinks both to nothing, so the instance
  // slots stay stable for the renderer.
  const hairStyle = style.hairStyle;
  const capScale = hairStyle === 2 ? 0.001 : 1;
  put(
    "hair",
    0,
    headY + headRadius * 0.16 + shift,
    lean * 0.6 - 0.008 * s,
    headRadius * 1.1 * capScale,
    headRadius * 1.12 * capScale,
    headRadius * 1.13 * capScale,
  );
  const longHair = hairStyle === 1 ? 1 : 0.001;
  put(
    "hair",
    0,
    headY - headRadius * 0.42 + shift,
    lean * 0.6 - headRadius * 0.34,
    headRadius * 0.94 * longHair,
    headRadius * 1.05 * longHair,
    headRadius * 0.62 * longHair,
  );
  // Neck: thick and short, so the head sits on the shoulders instead of hovering.
  put("head", 0, headY - headRadius * 1.18 + shift, lean * 0.6, headRadius * 0.62, headRadius * 0.5, headRadius * 0.6);
  for (const side of [-1, 1] as const) {
    put("eye", side * headRadius * 0.34, headY + headRadius * 0.12 + shift, lean * 0.6 + headRadius * 0.9, headRadius * 0.115, headRadius * 0.1, headRadius * 0.08);
  }

  // --- chest and hips -----------------------------------------------------
  put(
    "chest",
    0,
    (shoulderY + hipY) / 2 + 0.04 * s + shift,
    lean,
    SKELETON.chestHalfWidth * wide * s,
    SKELETON.chestHalfHeight * 0.96 * s,
    SKELETON.chestHalfDepth * wide * s,
  );
  // A flatter, wider mass at the shoulder line. Without it the jacket is one
  // egg and the arms hang beside it with daylight in between.
  put(
    "chest",
    0,
    shoulderY - 0.07 * s + shift,
    lean * 0.8,
    (SKELETON.chestHalfWidth * wide + 0.03) * s,
    0.085 * s,
    SKELETON.chestHalfDepth * wide * 0.96 * s,
  );
  put("hips", 0, hipY + 0.015 * s + shift, 0, SKELETON.hipHalfWidth * s, SKELETON.hipHalfHeight * s, SKELETON.hipHalfDepth * s);

  // --- legs ---------------------------------------------------------------
  // A walk is not a symmetric scissor. The swing leg bends its knee, which
  // shortens it and lifts the foot; the stance leg stays long and carries the
  // body. Without the knee bend both feet left the ground at once and everyone
  // hovered; with it, the body drops so the stance foot rests on the path.
  for (const leg of legs) {
    const hipX = leg.side * SKELETON.hipHalf * s;
    const legLean = leg.side * 0.035;
    put("legUpper", hipX, (hipY + leg.kneeY) / 2 + shift, leg.kneeForward / 2, 0.068 * s, SKELETON.thigh * s, 0.068 * s, leg.angle, legLean);
    put(
      "legLower",
      hipX,
      (leg.kneeY + leg.ankleY) / 2 + shift,
      leg.kneeForward + Math.sin(leg.shinAngle) * SKELETON.shin * s * 0.5,
      0.052 * s,
      SKELETON.shin * s,
      0.052 * s,
      leg.shinAngle,
      legLean,
    );
    // Shoe hangs from the ankle, so it travels with the foot.
    const shoeHalfHeight = 0.042 * s;
    put("shoe", hipX, leg.sole + shift + shoeHalfHeight, leg.shinForward + 0.045 * s, 0.062 * s, shoeHalfHeight, 0.105 * s);
  }

  // --- arms ---------------------------------------------------------------
  for (const [side, armPose, armOut] of [[-1, pose.armL, pose.armOutL], [1, pose.armR, pose.armOutR]] as const) {
    const armAngle = armPose * gait;
    // The shoulder joint sits just inside the chest, so the arm touches the
    // torso instead of floating beside it.
    const shoulderX = side * (SKELETON.chestHalfWidth * wide * 0.94 + 0.03) * s;
    const jointY = shoulderY - 0.1 * s;
    const upperLength = SKELETON.upperArm * s;
    // Arms splay out from the body instead of hanging inside the chest: without
    // the splay the sleeves merge into the torso and a figure loses its arms.
    const armLean = side * (0.1 + armOut * 0.22);
    const elbowY = jointY - Math.cos(armAngle) * Math.cos(armLean) * upperLength;
    const elbowForward = Math.sin(armAngle) * upperLength;
    const elbowOut = Math.sin(armLean) * upperLength;
    put(
      "armUpper",
      shoulderX + elbowOut / 2,
      (jointY + elbowY) / 2 + shift,
      elbowForward / 2,
      0.05 * s,
      upperLength,
      0.05 * s,
      armAngle,
      armLean,
    );

    // The forearm bends forward: that bend is what makes a standing figure read
    // as a person rather than as a post.
    const forearmAngle = armAngle + (interacting ? 0.3 : 0.12);
    const forearmLength = SKELETON.forearm * s;
    const handY = elbowY - Math.cos(forearmAngle) * forearmLength;
    put(
      "armLower",
      shoulderX + elbowOut + Math.sin(armLean * 0.4) * forearmLength * 0.3,
      (elbowY + handY) / 2 + shift,
      elbowForward + (Math.sin(forearmAngle) * forearmLength) / 2,
      0.038 * s,
      forearmLength,
      0.038 * s,
      forearmAngle,
      armLean * 0.4,
    );
    // A hand at the end of the forearm: without it the arm stops at a stump and
    // a standing figure reads as a mannequin.
    put(
      "hand",
      shoulderX + elbowOut + Math.sin(armLean * 0.4) * forearmLength * 0.6,
      handY - 0.02 * s + shift,
      elbowForward + Math.sin(forearmAngle) * forearmLength,
      0.042 * s,
      0.055 * s,
      0.036 * s,
      forearmAngle,
      armLean * 0.4,
    );
  }

  return cursor;
}

/**
 * World-space axis of a cylinder part, for renderers and rasterisers: a limb is
 * drawn along its own `tilt` about the body's right axis, then turned by `yaw`.
 */
export function limbAxis(transform: BodyTransform): { x: number; y: number; z: number } {
  const cosTilt = Math.cos(transform.tilt);
  const dirX = cosTilt * Math.sin(transform.lean);
  const dirY = -cosTilt * Math.cos(transform.lean);
  const dirZ = Math.sin(transform.tilt);
  const cos = Math.cos(transform.yaw);
  const sin = Math.sin(transform.yaw);
  return {
    x: dirX * cos + dirZ * sin,
    y: dirY,
    z: -dirX * sin + dirZ * cos,
  };
}
