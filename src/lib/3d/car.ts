import type { LoftSection, Part, PartMaterial } from "./parts";

/**
 * The parked cars, as geometry.
 *
 * Like everything else on a plot these are descriptors, not meshes: the renderer
 * merges them per material and the validator measures them. What makes them read
 * as cars rather than as vans is the loft primitive — the body is a stack of
 * cross-sections swept along its length, so the bonnet drops to the nose, the
 * shoulder swells over the rear wheel and the tail tapers.
 *
 * Two bodies cover the development: a low fastback coupé for the smaller homes
 * and a taller four-door for the family typologies. Everything is in metres, in
 * ground coordinates, +Z forward, symmetric about X, with the tyre contact patch
 * at y = 0 — a car that hovers is the same defect as a house that does.
 *
 * Accessories are positioned against the *local* width of the body at their own
 * z, never against the car's overall width. That was the bug in the first pass:
 * lamps and splitters sized from the widest section floated off the tapered nose
 * and read as slabs stuck onto the coachwork.
 *
 * These are representational props, not models of a specific car. No badge,
 * plate or model name is invented anywhere in the scene.
 */

export type CarStyle = "coupe" | "suv";

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
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  wheelRadius: number;
  tyreWidth: number;
  /** Beltline: where the glass meets the painted body. */
  belt: number;
  body: BodySection[];
  cabin: CabinSection[];
}

/**
 * Proportions follow the reference cars in the room: long bonnet, cab pushed
 * back, short overhangs, wide haunches, wheels filling their arches.
 *
 * Sizes stay inside the carport bay they have to sit in — 1.90 m wide, under
 * 4.9 m long — so a car never touches a post or overhangs the apron.
 */
const SPECS: Record<CarStyle, CarSpec> = {
  coupe: {
    length: 4.55,
    width: 1.86,
    height: 1.32,
    wheelbase: 2.66,
    wheelRadius: 0.335,
    tyreWidth: 0.235,
    belt: 0.97,
    body: [
      { z: 2.275, halfWidth: 0.74, bottom: 0.26, top: 0.66 },
      { z: 2.19, halfWidth: 0.85, bottom: 0.2, top: 0.72 },
      { z: 1.95, halfWidth: 0.9, bottom: 0.16, top: 0.79 },
      { z: 1.6, halfWidth: 0.915, bottom: 0.14, top: 0.84 },
      { z: 1.15, halfWidth: 0.925, bottom: 0.13, top: 0.9 },
      { z: 0.55, halfWidth: 0.93, bottom: 0.12, top: 0.95 },
      { z: -0.1, halfWidth: 0.935, bottom: 0.12, top: 0.97 },
      { z: -0.75, halfWidth: 0.925, bottom: 0.12, top: 0.97 },
      { z: -1.4, halfWidth: 0.9, bottom: 0.14, top: 0.95 },
      { z: -1.9, halfWidth: 0.88, bottom: 0.19, top: 0.92 },
      { z: -2.16, halfWidth: 0.86, bottom: 0.24, top: 0.9 },
      { z: -2.275, halfWidth: 0.8, bottom: 0.3, top: 0.85 },
    ],
    cabin: [
      { z: 1.06, halfWidth: 0.72, topHalfWidth: 0.7, bottom: 0.93, top: 0.97 },
      { z: 0.82, halfWidth: 0.735, topHalfWidth: 0.66, bottom: 0.94, top: 1.08 },
      { z: 0.5, halfWidth: 0.75, topHalfWidth: 0.64, bottom: 0.95, top: 1.2 },
      { z: 0.12, halfWidth: 0.76, topHalfWidth: 0.63, bottom: 0.95, top: 1.29 },
      { z: -0.4, halfWidth: 0.76, topHalfWidth: 0.63, bottom: 0.95, top: 1.32 },
      { z: -0.85, halfWidth: 0.75, topHalfWidth: 0.62, bottom: 0.94, top: 1.29 },
      { z: -1.3, halfWidth: 0.72, topHalfWidth: 0.6, bottom: 0.93, top: 1.18 },
      { z: -1.72, halfWidth: 0.66, topHalfWidth: 0.58, bottom: 0.92, top: 1.01 },
    ],
  },
  suv: {
    length: 4.8,
    width: 1.9,
    height: 1.6,
    wheelbase: 2.92,
    wheelRadius: 0.365,
    tyreWidth: 0.255,
    belt: 1.06,
    body: [
      { z: 2.4, halfWidth: 0.78, bottom: 0.32, top: 0.9 },
      { z: 2.28, halfWidth: 0.86, bottom: 0.26, top: 0.95 },
      { z: 2.05, halfWidth: 0.92, bottom: 0.22, top: 0.99 },
      { z: 1.7, halfWidth: 0.94, bottom: 0.19, top: 1.02 },
      { z: 1.2, halfWidth: 0.95, bottom: 0.18, top: 1.06 },
      { z: 0.6, halfWidth: 0.955, bottom: 0.17, top: 1.08 },
      { z: -0.1, halfWidth: 0.955, bottom: 0.17, top: 1.09 },
      { z: -0.8, halfWidth: 0.95, bottom: 0.18, top: 1.08 },
      { z: -1.45, halfWidth: 0.93, bottom: 0.2, top: 1.06 },
      { z: -1.95, halfWidth: 0.91, bottom: 0.24, top: 1.04 },
      { z: -2.25, halfWidth: 0.89, bottom: 0.3, top: 1.02 },
      { z: -2.4, halfWidth: 0.81, bottom: 0.38, top: 0.98 },
    ],
    cabin: [
      { z: 1.2, halfWidth: 0.75, topHalfWidth: 0.73, bottom: 1.02, top: 1.07 },
      { z: 0.95, halfWidth: 0.765, topHalfWidth: 0.7, bottom: 1.03, top: 1.24 },
      { z: 0.62, halfWidth: 0.775, topHalfWidth: 0.68, bottom: 1.04, top: 1.44 },
      { z: 0.25, halfWidth: 0.78, topHalfWidth: 0.67, bottom: 1.04, top: 1.57 },
      { z: -0.25, halfWidth: 0.78, topHalfWidth: 0.67, bottom: 1.04, top: 1.6 },
      { z: -0.8, halfWidth: 0.775, topHalfWidth: 0.66, bottom: 1.04, top: 1.58 },
      { z: -1.35, halfWidth: 0.755, topHalfWidth: 0.64, bottom: 1.03, top: 1.48 },
      { z: -1.85, halfWidth: 0.71, topHalfWidth: 0.62, bottom: 1.02, top: 1.28 },
      { z: -2.18, halfWidth: 0.64, topHalfWidth: 0.58, bottom: 1.01, top: 1.1 },
    ],
  },
};

const BODY_SQUARENESS = 4.2;
const CABIN_SQUARENESS = 3.4;

/**
 * Sample the painted body at a z: half width, underside and top.
 *
 * Every accessory is placed against these, never against the car's overall
 * dimensions. Sized from the widest section, a splitter or a spoiler hangs off
 * the tapered nose or floats above the falling tail — which is exactly how the
 * first pass looked.
 */
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

function box(id: string, material: PartMaterial, x: number, y: number, z: number, size: [number, number, number], rotation?: [number, number, number]): Part {
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
 * One wheel: the dark arch must sit *outside* the body shell or the closed hull
 * hides it, so the stack from the panel outward is arch → tyre face → alloy.
 */
function wheelParts(prefix: string, spec: CarSpec, side: -1 | 1, axle: -1 | 1, segments: number): Part[] {
  const z = axle * (spec.wheelbase / 2);
  const panel = bodyAt(spec, z).halfWidth;
  // The tyre's sidewall is the outermost part of a wheel; the alloy and spokes
  // sit recessed inside it. Anything standing proud of the panel turns into a
  // fin on the flank once the body shell is closed.
  const tyreFace = panel + 0.012;
  const tyreX = tyreFace - spec.tyreWidth / 2;
  const parts: Part[] = [
    cylinder(`${prefix}/tyre`, "charcoal", [side * tyreX, spec.wheelRadius, z], spec.wheelRadius, spec.tyreWidth, [0, 0, Math.PI / 2], segments),
    cylinder(`${prefix}/alloy`, "metal", [side * (tyreFace - 0.016), spec.wheelRadius, z], spec.wheelRadius * 0.7, 0.018, [0, 0, Math.PI / 2], segments),
    cylinder(`${prefix}/hub`, "charcoal", [side * (tyreFace - 0.014), spec.wheelRadius, z], 0.052, 0.022, [0, 0, Math.PI / 2], 10),
  ];
  const spokes = 5;
  for (let i = 0; i < spokes; i += 1) {
    const angle = (i / spokes) * Math.PI * 2;
    parts.push(
      box(
        `${prefix}/spoke-${i}`,
        "metal",
        side * (tyreFace - 0.026),
        spec.wheelRadius + Math.cos(angle) * spec.wheelRadius * 0.3,
        z + Math.sin(angle) * spec.wheelRadius * 0.3,
        [0.014, spec.wheelRadius * 0.62, 0.05],
        [angle, 0, 0],
      ),
    );
  }
  return parts;
}

/**
 * Build one parked car.
 *
 * `fit` scales the whole car down when a carport bay is shallower than the
 * nominal body — uniformly, so proportions survive. The old code scaled only Z,
 * which squashed the wheels into ellipses.
 */
export function carParts(code: string, index: number, x: number, paint: PartMaterial, style: CarStyle, fit = 1, lowQuality = false): Part[] {
  const nominal = SPECS[style];
  const scale = Math.min(1, Math.max(0.7, fit));
  const segments = lowQuality ? 10 : 14;

  const spec: CarSpec = {
    ...nominal,
    length: nominal.length * scale,
    width: nominal.width * scale,
    height: nominal.height * scale,
    wheelbase: nominal.wheelbase * scale,
    wheelRadius: nominal.wheelRadius * scale,
    tyreWidth: nominal.tyreWidth * scale,
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

  // The greenhouse must sit on the coachwork, not inside it: if its underside
  // dips below the body's top line the painted hull shows through the glass and
  // the flank gets a dark wedge that grows toward the tail.
  spec.cabin = spec.cabin.map((section) => ({
    ...section,
    bottom: Math.max(section.bottom, bodyAt(spec, section.z).top + 0.008 * scale),
  }));

  const prefix = `${code}/car-${index}`;
  const halfWidth = spec.width / 2;
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

  // Painted roof: the glass canopy's top surface, raised a few millimetres so it
  // reads as a panel rather than a blacked-out dome.
  const roofRows: LoftSection[] = [];
  for (const section of spec.cabin) {
    if (section.z > 0.52 * scale || section.z < -0.98 * scale) continue;
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
      parts.push(...wheelParts(`${prefix}/wheel-${side === -1 ? "l" : "r"}-${axle === 1 ? "f" : "r"}`, spec, side, axle, segments));
    }
  }

  // Front. Widths *and* heights come from the body's own section at that z.
  // The body is a closed shell: an accessory placed behind the nose cap is
  // simply invisible. Every front feature therefore straddles the cap plane.
  const face = bodyAt(spec, nose);
  const grilleY = face.bottom + (face.top - face.bottom) * 0.3;
  const lampY = face.top - (face.top - face.bottom) * 0.22;
  parts.push(
    // One grille, one full-width lower intake, one splitter: a calm face reads
    // better at 60 px than a cluster of small shapes.
    box(`${prefix}/grille`, "charcoal", x, grilleY + 0.02 * scale, nose + 0.005, [face.halfWidth * 0.62, 0.13 * scale, 0.07]),
    box(`${prefix}/intake`, "charcoal", x, grilleY - 0.085 * scale, nose - 0.005, [face.halfWidth * 1.44, 0.09 * scale, 0.07]),
    box(`${prefix}/splitter`, "charcoal", x, face.bottom + 0.015, nose - 0.02, [face.halfWidth * 1.86, 0.045 * scale, 0.14]),
    // Daytime strip: a single light signature spanning the nose.
    box(`${prefix}/lamp-lens`, "charcoal", x, lampY, nose - 0.004, [face.halfWidth * 1.62, 0.05 * scale, 0.05]),
    box(`${prefix}/lamp-drl`, "white", x, lampY - 0.012 * scale, nose - 0.008, [face.halfWidth * 1.5, 0.015 * scale, 0.03]),
  );

  // Mirrors, on a stalk that starts on the coachwork.
  for (const side of [-1, 1] as const) {
    const doorHalf = bodyAt(spec, 0.55 * scale).halfWidth;
    parts.push(
      box(`${prefix}/mirror-stalk-${side}`, "charcoal", x + side * (doorHalf + 0.024), belt + 0.035 * scale, 0.55 * scale, [0.05, 0.018, 0.028]),
      box(`${prefix}/mirror-${side}`, paint, x + side * (doorHalf + 0.062), belt + 0.05 * scale, 0.55 * scale, [0.062, 0.055 * scale, 0.042]),
    );
  }

  // Rear. The tapered tail gets narrower features, not the full car's width, and
  // everything rides the body's own top and bottom lines.
  const rear = bodyAt(spec, tail);
  const lightY = rear.top - (rear.top - rear.bottom) * 0.26;
  parts.push(
    box(`${prefix}/lightbar`, "charcoal", x, lightY, tail - 0.012, [rear.halfWidth * 1.66, 0.075 * scale, 0.055]),
    box(`${prefix}/lightbar-drl`, "white", x, lightY, tail - 0.018, [rear.halfWidth * 1.5, 0.022 * scale, 0.03]),
    box(`${prefix}/diffuser`, "charcoal", x, rear.bottom + 0.075 * scale, tail - 0.015, [rear.halfWidth * 1.7, 0.15 * scale, 0.15]),
    box(`${prefix}/spoiler`, paint, x, rear.top + 0.012 * scale, tail + 0.12, [rear.halfWidth * 1.62, 0.026 * scale, 0.1]),
    box(`${prefix}/plate`, "white", x, rear.bottom + 0.26 * scale, tail - 0.012, [0.36 * scale, 0.09 * scale, 0.02]),
  );
  for (const offset of [-0.44, -0.32, 0.32, 0.44]) {
    parts.push(
      cylinder(
        `${prefix}/exhaust-${offset}`,
        "metal",
        [x + offset * rear.halfWidth, rear.bottom + 0.14 * scale, tail - 0.03],
        0.042 * scale,
        0.09 * scale,
        [Math.PI / 2, 0, 0],
        10,
      ),
    );
  }

  // Underbody: a dark floor, so the shell never reads as hollow from a low angle.
  parts.push(box(`${prefix}/floor`, "charcoal", x, 0.15 * scale, 0, [halfWidth * 1.5, 0.05 * scale, spec.length * 0.8]));

  return parts;
}
