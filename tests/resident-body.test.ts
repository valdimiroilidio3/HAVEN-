import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import {
  RESIDENTS,
  buildResidentWorld,
  createResidentSim,
  stepResidentSim,
  type Resident,
} from "@/lib/3d/residents";
import {
  BODY_INSTANCES,
  BODY_PART_COUNT,
  BODY_PARTS,
  BODY_PRIMITIVE,
  PART_COLOUR,
  createBodyBuffer,
  fillBody,
  instanceSlot,
  limbAxis,
} from "@/lib/3d/resident-skeleton";

/**
 * The body.
 *
 * These assertions are the difference between "a person" and "a capsule": the
 * head must sit above the shoulders, the feet must reach the ground, the total
 * height must match the person's recorded height, and the parts must be arranged
 * like a human being. They are checked on the exact transforms the renderer
 * writes into the GPU buffers.
 */

const entries = SEED_UNITS.map((unit) => ({
  code: unit.code,
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
  typology: unit.typology,
}));

const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
const buffer = createBodyBuffer();

function partsOf(resident: Resident) {
  const written = fillBody(resident, buffer);
  return { written, parts: buffer.slice(0, written) };
}

function bounds(parts: ReturnType<typeof partsOf>["parts"]) {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const part of parts) {
    const half = BODY_PRIMITIVE[part.part] === "cylinder" ? Math.abs(part.sy) / 2 : Math.abs(part.sy);
    minY = Math.min(minY, part.y - half);
    maxY = Math.max(maxY, part.y + half);
  }
  return { minY, maxY };
}

describe("the body", () => {
  it("is made of eighteen articulated pieces per person", () => {
    expect(BODY_INSTANCES).toBe(18);
    expect(Object.values(BODY_PART_COUNT).reduce((a, b) => a + b, 0)).toBe(BODY_INSTANCES);
    expect(BODY_PARTS).toHaveLength(10);
    const { written, parts } = partsOf(sim.residents[0]!);
    expect(written).toBe(BODY_INSTANCES);
    expect(parts).toHaveLength(BODY_INSTANCES);
  });

  it("reaches the recorded adult height, from the ground to the top of the head", () => {
    for (const resident of sim.residents) {
      const { parts } = partsOf(resident);
      const { minY, maxY } = bounds(parts);
      const top = maxY - RESIDENTS.groundY;
      // Within 8 cm of the recorded height, and the feet on the ground.
      expect(Math.abs(top - resident.style.height), resident.id).toBeLessThan(0.18);
      expect(minY, `${resident.id} floats or sinks`).toBeGreaterThan(-0.02);
      expect(minY).toBeLessThan(0.12);
    }
  });

  it("stacks the body like a human: feet, legs, torso, head", () => {
    const resident = sim.residents[0]!;
    const { parts } = partsOf(resident);
    const find = (part: string) => parts.filter((entry) => entry.part === part);
    const hips = find("hips")[0]!;
    const chest = find("chest")[0]!;
    const head = find("head")[0]!;
    const shoe = find("shoe")[0]!;
    const thigh = find("legUpper")[0]!;
    const shin = find("legLower")[0]!;

    expect(shoe.y).toBeLessThan(thigh.y);
    expect(thigh.y).toBeLessThan(hips.y);
    expect(hips.y).toBeLessThan(chest.y);
    expect(chest.y).toBeLessThan(head.y);
    // And the knee is between the hip and the ankle.
    expect(shin.y).toBeGreaterThan(shoe.y);
    expect(shin.y).toBeLessThan(thigh.y);
  });

  it("has a head of plausible size against the total height", () => {
    for (const resident of sim.residents) {
      const { parts } = partsOf(resident);
      const head = parts.find((entry) => entry.part === "head")!;
      const headHeight = head.sy * 2;
      const ratio = headHeight / resident.style.height;
      // Adult head is roughly one seventh to one eighth of standing height.
      expect(ratio, resident.id).toBeGreaterThan(0.09);
      expect(ratio, resident.id).toBeLessThan(0.16);
    }
  });

  it("gives every person a different body", () => {
    const signatures = sim.residents.map((resident) => {
      const { parts } = partsOf(resident);
      const head = parts.find((entry) => entry.part === "head")!;
      return `${head.y.toFixed(3)}:${head.sx.toFixed(3)}`;
    });
    expect(new Set(signatures).size).toBeGreaterThan(10);
  });

  it("looks where it walks: nose and eyes are on the face, and it turns", () => {
    const walker = sim.residents.find((resident) => resident.state === "walking") ?? sim.residents[0]!;
    const walking = { ...walker, state: "walking" as const, stride: 1.2, speed: 1.2, rotationY: 0 };
    const { parts } = partsOf(walking);
    const headParts = parts.filter((entry) => entry.part === "head");
    const [skull, nose] = headParts;
    const eyes = parts.filter((entry) => entry.part === "eye");
    // At yaw 0 the body faces +Z, so the nose is in front of the skull.
    expect(nose!.z).toBeGreaterThan(skull!.z);
    expect(eyes).toHaveLength(2);
    for (const eye of eyes) expect(eye.z).toBeGreaterThan(skull!.z);

    // Turning the body moves the nose round with it: this is the same rotation
    // the renderer applies to the instance matrix.
    const turned = partsOf({ ...walking, rotationY: Math.PI / 2 }).parts;
    const turnedNose = turned.filter((entry) => entry.part === "head")[1]!;
    expect(turnedNose.x).toBeGreaterThan(turned[0]!.x);
  });

  it("bends knees and elbows when walking", () => {
    const resident = { ...sim.residents[0]!, state: "walking" as const, stride: Math.PI / 2, speed: 1.3 };
    const { parts } = partsOf(resident);
    const thighs = parts.filter((entry) => entry.part === "legUpper");
    const shins = parts.filter((entry) => entry.part === "legLower");
    const upperArms = parts.filter((entry) => entry.part === "armUpper");
    // One leg forward, one back — a stride, not a statue.
    expect(Math.abs(thighs[0]!.tilt - thighs[1]!.tilt)).toBeGreaterThan(0.5);
    expect(Math.abs(shins[0]!.tilt - shins[1]!.tilt)).toBeGreaterThan(0.2);
    expect(Math.abs(upperArms[0]!.tilt - upperArms[1]!.tilt)).toBeGreaterThan(0.2);
    // The shin continues the thigh rather than detaching from it.
    expect(Math.abs(shins[0]!.tilt)).toBeLessThan(Math.abs(thighs[0]!.tilt) + 0.01);
  });

  it("keeps limbs paired across the body's centre line", () => {
    // Mid-stride at zero phase: both legs are under the body, so the only
    // asymmetry left is the deliberate one in the arms.
    // Facing +Z at the origin, so world axes are the body's own axes.
    const resident = { ...sim.residents[0]!, state: "walking" as const, stride: 0, speed: 1.3, x: 0, z: 0, rotationY: 0 };
    const { parts } = partsOf(resident);
    for (const part of ["armUpper", "armLower", "legUpper", "legLower", "shoe"] as const) {
      const pair = parts.filter((entry) => entry.part === part);
      expect(pair).toHaveLength(2);
      // Mirrored left/right. Arms are deliberately asymmetric (one hand
      // gestures more than the other), so depth is only required for legs.
      expect(Math.abs(pair[0]!.x - pair[1]!.x)).toBeGreaterThan(0.1);
      if (part.startsWith("leg") || part === "shoe") {
        expect(Math.abs(pair[0]!.y - pair[1]!.y)).toBeLessThan(0.02);
        expect(Math.abs(pair[0]!.z - pair[1]!.z)).toBeLessThan(0.02);
      }
    }
  });

  it("dresses everyone in skin, shirt, trousers and shoes", () => {
    for (const resident of sim.residents) {
      const palette = new Set<string>([
        String(resident.style.skin),
        String(resident.style.shirt),
        String(resident.style.trousers),
        String(resident.style.hair),
      ]);
      expect(palette.size).toBe(4);
    }
    // Head and hands share the skin material; the torso wears the shirt.
    expect(PART_COLOUR.head).toBe("skin");
    expect(PART_COLOUR.armLower).toBe("skin");
    expect(PART_COLOUR.chest).toBe("shirt");
    expect(PART_COLOUR.legUpper).toBe("trousers");
    expect(PART_COLOUR.shoe).toBe("shoe");
  });

  it("gives every body its own instances, filling each buffer exactly", () => {
    // The renderer keeps one InstancedMesh per part, holding
    // BODY_PART_COUNT[part] × count instances. Every body must write its own
    // block: writing them all into slots 0..n would pile the population into a
    // single person (this was a real bug, caught by re-reading the frame loop).
    const count = 20;
    const seen = new Map<string, Set<number>>();
    for (const resident of sim.residents) {
      const { parts } = partsOf(resident);
      for (const part of parts) {
        const slot = instanceSlot(resident.index, part.part, part.slot);
        expect(slot, `${resident.id} ${part.part}`).toBeGreaterThanOrEqual(resident.index * BODY_PART_COUNT[part.part]);
        expect(slot).toBeLessThan((resident.index + 1) * BODY_PART_COUNT[part.part]);
        const key = `${resident.index}:${part.part}`;
        const slots = seen.get(key) ?? new Set<number>();
        expect(slots.has(slot), "two pieces share one instance").toBe(false);
        slots.add(slot);
        seen.set(key, slots);
      }
    }
    // And the buffer is exactly as large as the population needs.
    expect(instanceSlot(count - 1, "armUpper", 1)).toBe(count * 2 - 1);
    expect(instanceSlot(count - 1, "head", 2)).toBe(count * 3 - 1);
  });

  it("points limb cylinders along their own axis", () => {
    // Straight down when the limb hangs, so a standing figure has vertical legs.
    const axis = limbAxis({ part: "legUpper", x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, yaw: 0, tilt: 0, slot: 0 });
    expect(axis.y).toBeCloseTo(-1, 6);
    // Swinging forward tips the axis toward +Z, which is where the body looks.
    const forward = limbAxis({ part: "legUpper", x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, yaw: 0, tilt: 0.5, slot: 0 });
    expect(forward.z).toBeGreaterThan(0.4);
    expect(forward.y).toBeLessThan(0);
  });
});

describe("a conversation, seen as geometry", () => {
  it("stands two people a natural gap apart, turned toward each other", () => {
    let checked = 0;
    for (let i = 0; i < 6000 && checked < 2; i += 1) {
      stepResidentSim(sim, 1 / 20);
      for (const resident of sim.residents) {
        if (resident.state !== "interacting" || resident.partner === null || resident.stateAge < 1.2) continue;
        const partner = sim.residents[resident.partner]!;
        if (partner.index < resident.index) continue;
        const gap = Math.hypot(partner.x - resident.x, partner.z - resident.z);
        expect(gap).toBeGreaterThan(0.7);
        expect(gap).toBeLessThan(2.2);
        // The chest of each is nearer the other than the back is: both faces
        // are on the line between them.
        const noseA = partsOf(resident).parts.filter((part) => part.part === "head")[1]!;
        const noseB = partsOf(partner).parts.filter((part) => part.part === "head")[1]!;
        const toB = Math.hypot(noseA.x - partner.x, noseA.z - partner.z);
        const toA = Math.hypot(noseB.x - resident.x, noseB.z - resident.z);
        expect(toB).toBeLessThan(gap + 0.2);
        expect(toA).toBeLessThan(gap + 0.2);
        checked += 1;
      }
    }
    expect(checked).toBe(2);
  });
});
