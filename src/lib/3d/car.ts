import type { LoftSection, Part, PartMaterial } from "./parts";

/**
 * The cars parked in the carports: three real models, modelled procedurally.
 *
 * Every dimension below is the manufacturer's published figure, in metres:
 *
 *   Ferrari Roma (2020)        4.656 × 1.974 × 1.301, wheelbase 2.670
 *   Ferrari 12Cilindri (2024)  4.733 × 2.000 × 1.292, wheelbase 2.700
 *   Ferrari Purosangue (2022)  4.973 × 2.028 × 1.589, wheelbase 3.018
 *
 * Tyre radii are computed from the published tyre sizes rather than guessed
 * (245/35 R20 → r 0.340, 275/35 R21 → r 0.363, 255/35 R22 → r 0.369). Tracks,
 * where used, are the published ones.
 *
 * What is modelled is the car's *form*: the section stack that produces the
 * silhouette, the proportion of bonnet to cabin, the overhangs, and the graphic
 * signature that identifies each car at a glance — the Roma's soft shark-nose
 * with its vertical grille blades, the 12Cilindri's full-width black visor with
 * the twin bonnet domes, the Purosangue's high beltline, black arch cladding and
 * raised tail. Badges, lettering and plates are not reproduced: they are tiny at
 * this scale and would be invented detail.
 *
 * Geometry rules that the earlier props got wrong and these keep:
 *   - accessories are measured against the body's own section at their z;
 *   - the greenhouse sits on the coachwork, never inside it;
 *   - the tyre sidewall is the outermost part of the wheel;
 *   - the shell is lofted with outward winding (see `loft-geometry.ts`).
 */

export type CarModel = "roma" | "12cilindri" | "purosangue";

/** Kept for the call sites that still think in body styles. */
export type CarStyle = CarModel;

interface BodySection {
  z: number;
  halfWidth: number;
  bottom: number;
  top: number;
}

interface CabinSection extends BodySection {
  /** Roof width; the difference from halfWidth is the tumblehome. */
  topHalfWidth: number;
}

interface CarSpec {
  name: string;
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  /** Published tyre radii, front and rear (a Purosangue runs a larger rear). */
  wheelRadius: number;
  rearWheelRadius: number;
  tyreWidth: number;
  rearTyreWidth: number;
  /** Where the glass meets the paint. */
  belt: number;
  body: BodySection[];
  cabin: CabinSection[];
  /** Front graphic: how the nose is cut. */
  nose: "shark" | "visor" | "slit";
  /** Wheel arches are painted or clad in black plastic. */
  archCladding: boolean;
  /**
   * Twin bonnet domes (12Cilindri). Modelled as a flag so the intent is
   * recorded, but not extruded: at scene distance they were 4 cm strips that
   * read as dark dashes on the bonnet. The car is identified by its visor.
   */
  bonnetDomes: boolean;
  /** Number of exhaust tips. */
  exhausts: 2 | 4;
}

/**
 * Station by station. `top` is the painted surface — the bonnet forward of the
 * windscreen, the beltline alongside the glass, the deck behind it — which is
 * what makes a coupé read differently from an SUV even in flat elevation.
 */
const SPECS: Record<CarModel, CarSpec> = {
  roma: {
    name: "Roma",
    length: 4.656,
    width: 1.974,
    height: 1.301,
    wheelbase: 2.67,
    wheelRadius: 0.34,
    rearWheelRadius: 0.354,
    tyreWidth: 0.245,
    rearTyreWidth: 0.285,
    belt: 0.945,
    nose: "shark",
    archCladding: false,
    bonnetDomes: false,
    exhausts: 4,
    body: [
      { z: 2.328, halfWidth: 0.56, bottom: 0.34, top: 0.69 },
      { z: 2.2, halfWidth: 0.79, bottom: 0.26, top: 0.735 },
      { z: 2.0, halfWidth: 0.9, bottom: 0.2, top: 0.775 },
      { z: 1.7, halfWidth: 0.955, bottom: 0.17, top: 0.82 },
      { z: 1.335, halfWidth: 0.975, bottom: 0.155, top: 0.855 },
      { z: 1.0, halfWidth: 0.98, bottom: 0.15, top: 0.885 },
      { z: 0.8, halfWidth: 0.978, bottom: 0.15, top: 0.915 },
      { z: 0.3, halfWidth: 0.987, bottom: 0.15, top: 0.95 },
      { z: -0.3, halfWidth: 0.987, bottom: 0.15, top: 0.96 },
      { z: -0.9, halfWidth: 0.98, bottom: 0.16, top: 0.975 },
      { z: -1.335, halfWidth: 0.972, bottom: 0.17, top: 0.962 },
      { z: -1.9, halfWidth: 0.93, bottom: 0.22, top: 0.94 },
      { z: -2.2, halfWidth: 0.86, bottom: 0.28, top: 0.9 },
      { z: -2.328, halfWidth: 0.78, bottom: 0.34, top: 0.86 },
    ],
    cabin: [
      { z: 0.8, halfWidth: 0.7, topHalfWidth: 0.66, bottom: 0.9, top: 0.96 },
      { z: 0.55, halfWidth: 0.73, topHalfWidth: 0.64, bottom: 0.92, top: 1.09 },
      { z: 0.25, halfWidth: 0.75, topHalfWidth: 0.62, bottom: 0.93, top: 1.2 },
      { z: -0.1, halfWidth: 0.76, topHalfWidth: 0.6, bottom: 0.94, top: 1.28 },
      { z: -0.55, halfWidth: 0.76, topHalfWidth: 0.6, bottom: 0.94, top: 1.301 },
      { z: -0.95, halfWidth: 0.75, topHalfWidth: 0.58, bottom: 0.93, top: 1.26 },
      { z: -1.3, halfWidth: 0.72, topHalfWidth: 0.56, bottom: 0.92, top: 1.14 },
      { z: -1.62, halfWidth: 0.66, topHalfWidth: 0.52, bottom: 0.91, top: 0.99 },
    ],
  },
  "12cilindri": {
    name: "12Cilindri",
    length: 4.733,
    width: 2.0,
    height: 1.292,
    wheelbase: 2.7,
    wheelRadius: 0.363,
    rearWheelRadius: 0.377,
    tyreWidth: 0.275,
    rearTyreWidth: 0.315,
    belt: 0.955,
    nose: "visor",
    archCladding: false,
    bonnetDomes: true,
    exhausts: 4,
    body: [
      { z: 2.3665, halfWidth: 0.58, bottom: 0.32, top: 0.66 },
      { z: 2.25, halfWidth: 0.82, bottom: 0.24, top: 0.7 },
      { z: 2.05, halfWidth: 0.93, bottom: 0.19, top: 0.745 },
      { z: 1.75, halfWidth: 0.98, bottom: 0.16, top: 0.8 },
      { z: 1.35, halfWidth: 1.0, bottom: 0.15, top: 0.845 },
      { z: 0.95, halfWidth: 1.0, bottom: 0.145, top: 0.885 },
      { z: 0.72, halfWidth: 0.99, bottom: 0.145, top: 0.93 },
      { z: 0.3, halfWidth: 0.995, bottom: 0.145, top: 0.965 },
      { z: -0.3, halfWidth: 1.0, bottom: 0.15, top: 0.975 },
      { z: -0.9, halfWidth: 0.995, bottom: 0.155, top: 0.99 },
      { z: -1.35, halfWidth: 0.985, bottom: 0.17, top: 0.98 },
      { z: -1.95, halfWidth: 0.94, bottom: 0.22, top: 0.955 },
      { z: -2.2, halfWidth: 0.89, bottom: 0.27, top: 0.93 },
      { z: -2.3665, halfWidth: 0.8, bottom: 0.33, top: 0.89 },
    ],
    cabin: [
      { z: 0.72, halfWidth: 0.71, topHalfWidth: 0.66, bottom: 0.92, top: 0.97 },
      { z: 0.5, halfWidth: 0.74, topHalfWidth: 0.65, bottom: 0.93, top: 1.08 },
      { z: 0.2, halfWidth: 0.76, topHalfWidth: 0.63, bottom: 0.94, top: 1.19 },
      { z: -0.15, halfWidth: 0.765, topHalfWidth: 0.62, bottom: 0.945, top: 1.27 },
      { z: -0.55, halfWidth: 0.765, topHalfWidth: 0.615, bottom: 0.95, top: 1.292 },
      { z: -0.95, halfWidth: 0.755, topHalfWidth: 0.6, bottom: 0.945, top: 1.25 },
      { z: -1.3, halfWidth: 0.72, topHalfWidth: 0.57, bottom: 0.935, top: 1.13 },
      { z: -1.6, halfWidth: 0.66, topHalfWidth: 0.53, bottom: 0.925, top: 0.99 },
    ],
  },
  purosangue: {
    name: "Purosangue",
    length: 4.973,
    width: 2.028,
    height: 1.589,
    wheelbase: 3.018,
    wheelRadius: 0.369,
    rearWheelRadius: 0.387,
    tyreWidth: 0.255,
    rearTyreWidth: 0.315,
    belt: 1.13,
    nose: "slit",
    archCladding: true,
    bonnetDomes: false,
    exhausts: 4,
    body: [
      { z: 2.4865, halfWidth: 0.62, bottom: 0.4, top: 0.8 },
      { z: 2.35, halfWidth: 0.86, bottom: 0.34, top: 0.84 },
      { z: 2.15, halfWidth: 0.96, bottom: 0.3, top: 0.88 },
      { z: 1.8, halfWidth: 1.005, bottom: 0.28, top: 0.93 },
      { z: 1.509, halfWidth: 1.014, bottom: 0.28, top: 0.97 },
      { z: 1.1, halfWidth: 1.014, bottom: 0.28, top: 1.02 },
      { z: 0.8, halfWidth: 1.01, bottom: 0.28, top: 1.08 },
      { z: 0.4, halfWidth: 1.014, bottom: 0.28, top: 1.13 },
      { z: -0.4, halfWidth: 1.014, bottom: 0.28, top: 1.15 },
      { z: -1.0, halfWidth: 1.01, bottom: 0.3, top: 1.15 },
      { z: -1.509, halfWidth: 1.0, bottom: 0.32, top: 1.13 },
      { z: -2.1, halfWidth: 0.95, bottom: 0.36, top: 1.1 },
      { z: -2.35, halfWidth: 0.88, bottom: 0.42, top: 1.06 },
      { z: -2.4865, halfWidth: 0.78, bottom: 0.5, top: 1.0 },
    ],
    // Upright, not a fastback: the roof holds its height to the C-pillar and then
    // drops steeply into the tailgate, which is what separates a four-door
    // high-ride from a coupé at a glance.
    cabin: [
      { z: 0.8, halfWidth: 0.74, topHalfWidth: 0.7, bottom: 1.09, top: 1.17 },
      { z: 0.6, halfWidth: 0.77, topHalfWidth: 0.68, bottom: 1.1, top: 1.33 },
      { z: 0.4, halfWidth: 0.79, topHalfWidth: 0.66, bottom: 1.11, top: 1.47 },
      { z: 0.15, halfWidth: 0.8, topHalfWidth: 0.65, bottom: 1.12, top: 1.55 },
      { z: -0.3, halfWidth: 0.805, topHalfWidth: 0.65, bottom: 1.12, top: 1.585 },
      { z: -0.9, halfWidth: 0.8, topHalfWidth: 0.65, bottom: 1.12, top: 1.589 },
      { z: -1.5, halfWidth: 0.79, topHalfWidth: 0.64, bottom: 1.11, top: 1.575 },
      { z: -1.85, halfWidth: 0.77, topHalfWidth: 0.63, bottom: 1.1, top: 1.53 },
      { z: -2.05, halfWidth: 0.74, topHalfWidth: 0.61, bottom: 1.09, top: 1.4 },
      { z: -2.18, halfWidth: 0.69, topHalfWidth: 0.57, bottom: 1.07, top: 1.2 },
    ],
  },
};

const BODY_SQUARENESS = 4.2;
const CABIN_SQUARENESS = 3.4;

/** Sample the painted body at a z: half width, underside and top. */
function bodyAt(spec: CarSpec, z: number): { halfWidth: number; bottom: number; top: number } {
  const sections = spec.body;
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  if (z >= first.z) return { halfWidth: first.halfWidth, bottom: first.bottom, top: first.top };
  if (z <= last.z) return { halfWidth: last.halfWidth, bottom: last.bottom, top: last.top };
  for (let i = 0; i < sections.length - 1; i += 1) {
    const a = sections[i]!;
    const b = sections[i + 1]!;
    if (z <= a.z && z >= b.z) {
      const t = (a.z - z) / (a.z - b.z);
      return {
        halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t,
        bottom: a.bottom + (b.bottom - a.bottom) * t,
        top: a.top + (b.top - a.top) * t,
      };
    }
  }
  return { halfWidth: last.halfWidth, bottom: last.bottom, top: last.top };
}

/** Centre a section stack on the part origin; the bounds maths assumes it. */
function centred(sections: LoftSection[]): { sections: LoftSection[]; y: number; z: number } {
  const zs = sections.map((section) => section.z);
  const bottoms = sections.map((section) => section.bottom);
  const tops = sections.map((section) => section.top);
  const y = (Math.min(...bottoms) + Math.max(...tops)) / 2;
  const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  return {
    y,
    z,
    sections: sections.map((section) => ({
      ...section,
      z: section.z - z,
      bottom: section.bottom - y,
      top: section.top - y,
    })),
  };
}

function loft(id: string, material: PartMaterial, x: number, sections: LoftSection[], segments: number): Part {
  const local = centred(sections);
  return {
    id,
    group: "car",
    material,
    shape: { kind: "loft", size: [0, 0, 0], position: [x, local.y, local.z], sections: local.sections, segments },
  };
}

function box(
  id: string,
  material: PartMaterial,
  x: number,
  y: number,
  z: number,
  size: [number, number, number],
  rotation?: [number, number, number],
): Part {
  return {
    id,
    group: "car",
    material,
    shape: { kind: "box", size, position: [x, y, z], ...(rotation ? { rotation } : {}) },
  };
}

function cylinder(
  id: string,
  material: PartMaterial,
  position: [number, number, number],
  radius: number,
  height: number,
  rotation: [number, number, number],
  segments = 16,
): Part {
  return {
    id,
    group: "car",
    material,
    shape: { kind: "cylinder", size: [radius, radius, height], position, rotation, segments },
  };
}

/**
 * A wheel: tyre sidewall outermost, alloy face and spokes recessed inside it,
 * centre cap deepest. Purosangue gets black arch cladding around the opening.
 */
function wheelParts(
  prefix: string,
  spec: CarSpec,
  x: number,
  side: -1 | 1,
  axle: -1 | 1,
  segments: number,
): Part[] {
  const z = axle * (spec.wheelbase / 2);
  const radius = axle === 1 ? spec.wheelRadius : spec.rearWheelRadius;
  const width = axle === 1 ? spec.tyreWidth : spec.rearTyreWidth;
  const panel = bodyAt(spec, z).halfWidth;
  const tyreFace = panel + 0.012;
  const tyreX = tyreFace - width / 2;
  const parts: Part[] = [
    cylinder(`${prefix}/tyre`, "charcoal", [side * tyreX, radius, z], radius, width, [0, 0, Math.PI / 2], segments),
    cylinder(`${prefix}/alloy`, "metal", [side * (tyreFace - 0.016), radius, z], radius * 0.7, 0.018, [0, 0, Math.PI / 2], segments),
    cylinder(`${prefix}/hub`, "charcoal", [side * (tyreFace - 0.014), radius, z], 0.055, 0.022, [0, 0, Math.PI / 2], 10),
  ];
  const spokes = spec.bonnetDomes ? 5 : 5;
  for (let i = 0; i < spokes; i += 1) {
    const angle = (i / spokes) * Math.PI * 2;
    parts.push(
      box(
        `${prefix}/spoke-${i}`,
        "metal",
        side * (tyreFace - 0.026),
        radius + Math.cos(angle) * radius * 0.3,
        z + Math.sin(angle) * radius * 0.3,
        [0.014, radius * 0.62, 0.05],
        [angle, 0, 0],
      ),
    );
  }
  if (spec.archCladding) {
    // Black plastic cladding over the arch, sitting just inside the tyre face.
    parts.push(
      {
        id: `${prefix}/arch-cladding`,
        group: "car",
        material: "charcoal",
        shape: {
          kind: "torus",
          size: [radius + 0.075, 0.042],
          position: [side * (panel - 0.05), radius + 0.13, z],
          rotation: [0, Math.PI / 2, 0],
          segments: 14,
        },
      },
    );
  }
  return parts;
}

/**
 * Build one parked car of a real model.
 *
 * `fit` scales the whole car uniformly when the carport bay is shallower than
 * the model — never in one axis, which turns wheels into ellipses.
 */
export function carParts(
  code: string,
  index: number,
  x: number,
  paint: PartMaterial,
  model: CarModel,
  fit = 1,
  lowQuality = false,
): Part[] {
  const nominal = SPECS[model];
  const scale = Math.min(1, Math.max(0.7, fit));
  const segments = lowQuality ? 10 : 14;

  const spec: CarSpec = {
    ...nominal,
    length: nominal.length * scale,
    width: nominal.width * scale,
    height: nominal.height * scale,
    wheelbase: nominal.wheelbase * scale,
    wheelRadius: nominal.wheelRadius * scale,
    rearWheelRadius: nominal.rearWheelRadius * scale,
    tyreWidth: nominal.tyreWidth * scale,
    rearTyreWidth: nominal.rearTyreWidth * scale,
    belt: nominal.belt * scale,
    body: nominal.body.map((section) => ({
      z: section.z * scale,
      halfWidth: section.halfWidth * scale,
      bottom: section.bottom * scale,
      top: section.top * scale,
    })),
    cabin: nominal.cabin.map((section) => ({
      z: section.z * scale,
      halfWidth: section.halfWidth * scale,
      topHalfWidth: section.topHalfWidth * scale,
      bottom: section.bottom * scale,
      top: section.top * scale,
    })),
  };

  // The greenhouse sits on the coachwork; a canopy that dips into the hull lets
  // the paint show through the glass.
  spec.cabin = spec.cabin.map((section) => ({
    ...section,
    bottom: Math.max(section.bottom, bodyAt(spec, section.z).top + 0.008 * scale),
  }));

  const prefix = `${code}/car-${index}`;
  const nose = spec.length / 2;
  const tail = -spec.length / 2;
  const belt = spec.belt;

  const parts: Part[] = [
    loft(
      `${prefix}/body`,
      paint,
      x,
      spec.body.map((section) => ({ ...section, squareness: BODY_SQUARENESS })),
      segments,
    ),
    loft(
      `${prefix}/cabin`,
      "carGlass",
      x,
      spec.cabin.map((section) => ({ ...section, squareness: CABIN_SQUARENESS })),
      segments,
    ),
  ];

  // Painted roof panel over the flatter part of the canopy.
  const roofRows: LoftSection[] = [];
  const roofFront = spec.cabin[0]!.z - 0.22 * scale;
  const roofBack = spec.cabin[spec.cabin.length - 1]!.z + 0.42 * scale;
  for (const section of spec.cabin) {
    if (section.z > roofFront || section.z < roofBack) continue;
    roofRows.push({
      z: section.z,
      halfWidth: section.topHalfWidth * 1.005,
      bottom: section.top - 0.03 * scale,
      top: section.top + 0.006 * scale,
      squareness: CABIN_SQUARENESS,
    });
  }
  if (roofRows.length >= 2) parts.push(loft(`${prefix}/roof`, paint, x, roofRows, segments));

  for (const side of [-1, 1] as const) {
    for (const axle of [-1, 1] as const) {
      parts.push(...wheelParts(`${prefix}/wheel-${side === -1 ? "l" : "r"}-${axle === 1 ? "f" : "r"}`, spec, x, side, axle, segments));
    }
  }

  parts.push(...frontSignature(prefix, spec, x, paint, scale, nose));
  parts.push(...rearSignature(prefix, spec, x, paint, scale, tail));
  parts.push(...sideDetails(prefix, spec, x, paint, scale));

  // Underbody: a dark floor, so the shell never reads as hollow from a low angle.
  // Inside the coachwork: at 1.5× the width it stuck out 0.25 m each side and
  // read as a slab under the car.
  parts.push(
    box(`${prefix}/floor`, "charcoal", x, bodyAt(spec, 0).bottom * 0.5, 0, [spec.width * 0.86, 0.05 * scale, spec.length * 0.78]),
  );

  return parts;
}

/**
 * Half width of the front bumper a little behind the nose cap.
 *
 * The very tip of the nose is the narrowest station on the car; a grille or a
 * splitter sized from it hangs in the air, and one sized from the car's overall
 * width sticks out sideways. Both happened; this reads the station in between.
 */
function bumperHalf(spec: CarSpec, nose: number, back = 0.45): number {
  return bodyAt(spec, nose - back).halfWidth;
}

/** The nose of each car: a shark nose, a black visor, or slits. */
function frontSignature(prefix: string, spec: CarSpec, x: number, paint: PartMaterial, scale: number, nose: number): Part[] {
  const face = bodyAt(spec, nose);
  const span = face.halfWidth;
  const bumper = bumperHalf(spec, nose);
  const parts: Part[] = [];

  if (spec.nose === "visor") {
    // 12Cilindri: a gloss-black band spanning the nose, lamps set inside it, and
    // a full-width DRL blade under the band.
    const bandY = face.top - (face.top - face.bottom) * 0.3;
    parts.push(
      box(`${prefix}/visor`, "carGlass", x, bandY, nose - 0.06, [bumper * 1.7, 0.1 * scale, 0.1]),
      box(`${prefix}/lamp-drl`, "white", x, bandY - 0.045 * scale, nose - 0.035, [bumper * 1.5, 0.018 * scale, 0.05]),
      box(`${prefix}/headlamp-l`, "charcoal", x - bumper * 0.52, bandY + 0.005, nose - 0.045, [bumper * 0.44, 0.052 * scale, 0.05]),
      box(`${prefix}/headlamp-r`, "charcoal", x + bumper * 0.52, bandY + 0.005, nose - 0.045, [bumper * 0.44, 0.052 * scale, 0.05]),
      box(`${prefix}/grille`, "charcoal", x, face.bottom + (face.top - face.bottom) * 0.2, nose - 0.045, [bumper * 1.42, 0.12 * scale, 0.07]),
      box(`${prefix}/splitter`, "charcoal", x, face.bottom + 0.015, nose - 0.08, [bumper * 1.78, 0.042 * scale, 0.12]),
    );
    return parts;
  }

  if (spec.nose === "shark") {
    // Roma: an overhanging nose with a wide body-colour grille carrying vertical
    // blades, and slim lamps tucked under the bonnet edge.
    const grilleY = face.bottom + (face.top - face.bottom) * 0.34;
    parts.push(
      box(`${prefix}/grille`, "charcoal", x, grilleY, nose - 0.045, [bumper * 1.2, 0.15 * scale, 0.07]),
      box(`${prefix}/splitter`, "charcoal", x, face.bottom + 0.02, nose - 0.08, [bumper * 1.76, 0.045 * scale, 0.12]),
    );
    for (const offset of [-0.42, -0.14, 0.14, 0.42]) {
      parts.push(
        box(`${prefix}/grille-blade-${offset}`, paint, x + offset * bumper, grilleY + 0.004, nose - 0.028, [0.028 * scale, 0.13 * scale, 0.04]),
      );
    }
    const lampY = face.top - (face.top - face.bottom) * 0.2;
    parts.push(
      box(`${prefix}/headlamp-l`, "charcoal", x - bumper * 0.6, lampY, nose - 0.045, [bumper * 0.46, 0.046 * scale, 0.06], [0, 0.18, 0]),
      box(`${prefix}/headlamp-r`, "charcoal", x + bumper * 0.6, lampY, nose - 0.045, [bumper * 0.46, 0.046 * scale, 0.06], [0, -0.18, 0]),
      box(`${prefix}/lamp-drl`, "white", x, lampY - 0.04 * scale, nose - 0.04, [bumper * 1.42, 0.014 * scale, 0.035]),
    );
    return parts;
  }

  // Purosangue: thin slits high on the corners, a blade dropping down each
  // corner, and a tall lower intake.
  const slitY = face.top - (face.top - face.bottom) * 0.16;
  parts.push(
    box(`${prefix}/intake`, "charcoal", x, face.bottom + (face.top - face.bottom) * 0.3, nose - 0.05, [bumper * 1.32, 0.24 * scale, 0.08]),
    box(`${prefix}/splitter`, "charcoal", x, face.bottom + 0.03, nose - 0.085, [bumper * 1.74, 0.06 * scale, 0.13]),
    box(`${prefix}/lamp-drl`, "white", x, slitY - 0.02 * scale, nose - 0.03, [bumper * 1.34, 0.016 * scale, 0.04]),
  );
  for (const side of [-1, 1] as const) {
    parts.push(
      box(`${prefix}/headlamp-${side}`, "charcoal", x + side * bumper * 0.62, slitY, nose - 0.035, [bumper * 0.38, 0.05 * scale, 0.05]),
      box(`${prefix}/corner-blade-${side}`, "charcoal", x + side * bumper * 0.86, slitY - 0.18 * scale, nose - 0.05, [0.05 * scale, 0.28 * scale, 0.09]),
    );
  }
  return parts;
}

/** The tail: a light bar, or the Purosangue's raised clusters. */
function rearSignature(prefix: string, spec: CarSpec, x: number, paint: PartMaterial, scale: number, tail: number): Part[] {
  const rear = bodyAt(spec, tail);
  const parts: Part[] = [];
  const barY = rear.top - (rear.top - rear.bottom) * 0.26;

  parts.push(
    box(`${prefix}/lightbar`, "charcoal", x, barY, tail + 0.04, [rear.halfWidth * 1.66, 0.075 * scale, 0.055]),
    box(`${prefix}/lightbar-drl`, "white", x, barY, tail + 0.018, [rear.halfWidth * 1.5, 0.02 * scale, 0.03]),
    box(`${prefix}/diffuser`, "charcoal", x, rear.bottom + 0.075 * scale, tail + 0.09, [rear.halfWidth * 1.7, 0.15 * scale, 0.15]),
    box(`${prefix}/plate`, "white", x, rear.bottom + 0.3 * scale, tail + 0.03, [0.36 * scale, 0.09 * scale, 0.02]),
  );

  if (spec.nose === "visor") {
    // Full-width blade under the tail, as on the 12Cilindri.
    parts.push(box(`${prefix}/spoiler`, paint, x, rear.top + 0.012 * scale, tail + 0.12, [rear.halfWidth * 1.62, 0.026 * scale, 0.1]));
  } else if (spec.nose === "shark") {
    // Roma: a small lip, no wing.
    parts.push(box(`${prefix}/spoiler`, paint, x, rear.top + 0.014 * scale, tail + 0.14, [rear.halfWidth * 1.5, 0.02 * scale, 0.09]));
  } else {
    // Purosangue: raised roof spoiler with a centre split, plus high tail lamps.
    parts.push(
      box(`${prefix}/spoiler-l`, paint, x - rear.halfWidth * 0.55, 1.42 * scale, tail + 0.42, [rear.halfWidth * 0.72, 0.05 * scale, 0.24], [0.18, 0, 0]),
      box(`${prefix}/spoiler-r`, paint, x + rear.halfWidth * 0.55, 1.42 * scale, tail + 0.42, [rear.halfWidth * 0.72, 0.05 * scale, 0.24], [0.18, 0, 0]),
      box(`${prefix}/tail-lamp-l`, "charcoal", x - rear.halfWidth * 0.6, barY + 0.12 * scale, tail + 0.04, [rear.halfWidth * 0.42, 0.12 * scale, 0.06]),
      box(`${prefix}/tail-lamp-r`, "charcoal", x + rear.halfWidth * 0.6, barY + 0.12 * scale, tail + 0.04, [rear.halfWidth * 0.42, 0.12 * scale, 0.06]),
    );
  }

  const tips: number[] = spec.exhausts === 4 ? [-0.46, -0.3, 0.3, 0.46] : [-0.42, 0.42];
  for (const offset of tips) {
    parts.push(
      cylinder(
        `${prefix}/exhaust-${offset}`,
        "metal",
        [x + offset * rear.halfWidth, rear.bottom + 0.14 * scale, tail + 0.06],
        0.042 * scale,
        0.09 * scale,
        [Math.PI / 2, 0, 0],
        10,
      ),
    );
  }
  return parts;
}

/** Mirrors, sill and the side vent each model carries. */
function sideDetails(prefix: string, spec: CarSpec, x: number, paint: PartMaterial, scale: number): Part[] {
  const parts: Part[] = [];
  const doorZ = spec.nose === "slit" ? 0.85 * scale : 0.55 * scale;
  for (const side of [-1, 1] as const) {
    const half = bodyAt(spec, doorZ).halfWidth;
    parts.push(
      box(`${prefix}/mirror-stalk-${side}`, "charcoal", x + side * (half + 0.024), spec.belt + 0.035 * scale, doorZ, [0.05, 0.018, 0.028]),
      box(`${prefix}/mirror-${side}`, paint, x + side * (half + 0.062), spec.belt + 0.05 * scale, doorZ, [0.062, 0.055 * scale, 0.042]),
    );
    if (spec.archCladding) {
      // Sill cladding: the black band that defines the Purosangue's stance.
      parts.push(
        box(
          `${prefix}/sill-cladding-${side}`,
          "charcoal",
          x + side * (bodyAt(spec, 0).halfWidth + 0.002),
          0.34 * scale,
          0,
          [0.03, 0.14 * scale, spec.wheelbase * 0.78],
        ),
      );
    }
  }
  return parts;
}

/** The published dimensions, for tests and for the selection panel. */
export function carSpec(model: CarModel): Readonly<CarSpec> {
  return SPECS[model];
}

export const CAR_MODELS: CarModel[] = ["roma", "12cilindri", "purosangue"];
