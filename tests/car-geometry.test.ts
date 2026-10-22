import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { carParts, type CarStyle } from "@/lib/3d/car";
import { partBounds, partTriangleBudget, type Part } from "@/lib/3d/parts";
import { loftGeometry } from "@/components/three/site/loft-geometry";
import { mergePartsByMaterial } from "@/components/three/site/plot-geometry";

/**
 * The parked cars.
 *
 * The first version of these props was five boxes: it read as a van, and the
 * renderer's own merge made it worse. They are now lofted bodies — a stack of
 * cross-sections swept along the car's length — which introduces exactly the
 * failure modes that are invisible on screen but visible in the geometry:
 *
 *   - a shell wound inside-out, which `FrontSide` renders as the inside of the
 *     car (this happened, and looked like a dark wedge across the flanks);
 *   - a shell that starts below grade;
 *   - a greenhouse whose underside sinks into the body;
 *   - a primitive missing an attribute, which makes `mergeGeometries` return
 *     null and the part vanish without an error.
 *
 * None of these can be seen in a screenshot with confidence, so they are pinned
 * here instead.
 */

const STYLES: CarStyle[] = ["coupe", "suv"];

function car(style: CarStyle, fit = 1, lowQuality = false): Part[] {
  return carParts("TST", 0, 0, "carPaint0", style, fit, lowQuality);
}

function bounds(part: Part) {
  return partBounds(part, { x: 0, z: 0 }, 0);
}

/** Signed volume of a geometry, via the divergence theorem over its triangles. */
function signedVolume(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i);
    b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

describe("loft geometry", () => {
  const sections = [
    { z: 1, halfWidth: 0.6, bottom: 0.1, top: 0.5 },
    { z: 0, halfWidth: 0.8, bottom: 0, top: 0.7 },
    { z: -1, halfWidth: 0.6, bottom: 0.1, top: 0.5 },
  ];

  it("builds a closed shell with outward-facing side faces", () => {
    const geometry = loftGeometry(sections, 16);
    // A clockwise sweep gives a negative volume: the shell is inside-out, and
    // three.js's FrontSide culling then shows the inside of the car.
    expect(signedVolume(geometry)).toBeGreaterThan(0);
  });

  it("emits the attributes the merge path requires", () => {
    const geometry = loftGeometry(sections, 16);
    // mergeGeometries silently returns null when attributes disagree, so a loft
    // without uvs would drop the entire car body without raising anything.
    for (const attribute of ["position", "normal", "uv"]) {
      expect(geometry.getAttribute(attribute), attribute).toBeDefined();
    }
    expect(geometry.getIndex()).not.toBeNull();
  });

  it("keeps every vertex finite", () => {
    const geometry = loftGeometry(sections, 16);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      expect(Number.isFinite(position.getX(i))).toBe(true);
      expect(Number.isFinite(position.getY(i))).toBe(true);
      expect(Number.isFinite(position.getZ(i))).toBe(true);
    }
  });

  it("spans exactly the section stack", () => {
    const geometry = loftGeometry(sections, 16);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.z).toBeCloseTo(-1, 6);
    expect(box.max.z).toBeCloseTo(1, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(0.7, 6);
    expect(box.max.x).toBeCloseTo(0.8, 6);
  });

  it("narrows toward the roof when tumblehome is given", () => {
    const geometry = loftGeometry(
      [
        { z: 0.4, halfWidth: 0.8, topHalfWidth: 0.6, bottom: 0, top: 0.6 },
        { z: -0.4, halfWidth: 0.8, topHalfWidth: 0.6, bottom: 0, top: 0.6 },
      ],
      24,
    );
    const position = geometry.getAttribute("position");
    // No vertex may sit wider than the shoulder, and the topmost ring must be
    // inside the roof width — that is what stops a greenhouse lofting into a dome.
    let maxX = 0;
    let xAtTop = 0;
    for (let i = 0; i < position.count; i += 1) {
      maxX = Math.max(maxX, Math.abs(position.getX(i)));
      if (Math.abs(position.getY(i) - 0.6) < 1e-6) xAtTop = Math.max(xAtTop, Math.abs(position.getX(i)));
    }
    expect(maxX).toBeLessThanOrEqual(0.8001);
    expect(xAtTop).toBeLessThanOrEqual(0.6001);
  });
});

describe("parked cars", () => {
  it.each(STYLES)("%s has the parts a car needs", (style) => {
    const parts = car(style);
    const ids = parts.map((part) => part.id);
    for (const suffix of ["body", "cabin"]) {
      expect(ids).toContain(`TST/car-0/${suffix}`);
    }
    // Four wheels, each with a tyre.
    expect(ids.filter((id) => id.endsWith("/tyre"))).toHaveLength(4);
    // Front and rear signatures.
    for (const suffix of ["grille", "splitter", "lamp-drl", "lightbar-drl", "plate"]) {
      expect(ids).toContain(`TST/car-0/${suffix}`);
    }
  });

  it.each(STYLES)("%s never reaches below grade", (style) => {
    // A wheel sunk into the apron is the same defect as a floating house.
    for (const part of car(style)) {
      expect(bounds(part).minY, part.id).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it.each(STYLES)("%s stands on its tyres", (style) => {
    const tyres = car(style).filter((part) => part.id.endsWith("/tyre"));
    for (const tyre of tyres) {
      expect(bounds(tyre).minY).toBeCloseTo(0, 3);
    }
  });

  it("seats the greenhouse on the coachwork at every station", () => {
    for (const style of STYLES) {
      const parts = car(style);
      const body = parts.find((part) => part.id.endsWith("/body"))!;
      const cabin = parts.find((part) => part.id.endsWith("/cabin"))!;
      const bodySections = body.shape.sections!;
      const cabinSections = cabin.shape.sections!;
      // Both lofts are centred by the same helper, so compare in that frame.
      for (const cabinSection of cabinSections) {
        const z = cabinSection.z + cabin.shape.position[2];
        const nearest = bodySections.reduce((best, section) =>
          Math.abs(section.z + body.shape.position[2] - z) < Math.abs(best.z + body.shape.position[2] - z) ? section : best,
        );
        const bodyTop = nearest.top + body.shape.position[1];
        const cabinBottom = cabinSection.bottom + cabin.shape.position[1];
        // A glasshouse that dips into the hull lets the paint show through it.
        expect(cabinBottom, `${style} @ z=${z.toFixed(2)}`).toBeGreaterThan(bodyTop - 0.05);
      }
    }
  });

  it.each(STYLES)("%s fits the carport bay it is parked in", (style) => {
    // The bays are 3.6 × 5.0 m (single) and 5.2 × 5.6 m (double), minus the
    // 0.4 m clearances the carport itself keeps.
    const parts = car(style);
    for (const part of parts) {
      const box = bounds(part);
      // Mirrors legitimately stick out past the body on a real car; everything
      // else has to stay inside the 1.90 m body.
      const allowance = part.id.includes("/mirror") ? 2.12 : 1.95;
      expect(box.maxX - box.minX, part.id).toBeLessThan(allowance);
      expect(box.maxZ - box.minZ, part.id).toBeLessThan(4.9);
      expect(box.minZ, part.id).toBeGreaterThan(-2.5);
      expect(box.maxZ, part.id).toBeGreaterThan(-2.5);
    }
    const whole = parts.reduce(
      (acc, part) => {
        const box = bounds(part);
        return { minX: Math.min(acc.minX, box.minX), maxX: Math.max(acc.maxX, box.maxX), minZ: Math.min(acc.minZ, box.minZ), maxZ: Math.max(acc.maxZ, box.maxZ) };
      },
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    // 1.86 m body + a mirror on each side ≈ 2.05 m. The single bay is 3.6 m and
    // the double bay puts the two cars 2.9 m apart, which leaves 0.85 m between
    // their mirrors.
    expect(whole.maxX - whole.minX).toBeLessThan(2.12);
    expect(whole.maxZ - whole.minZ).toBeLessThan(4.95);
    // Symmetric about the bay centre: a car parked off-axis hits a post.
    expect(Math.abs(whole.minX + whole.maxX) / 2).toBeLessThan(0.02);
    expect(Math.abs(whole.minZ + whole.maxZ) / 2).toBeLessThan(0.03);
  });

  it("falls back to a smaller car instead of a squashed one", () => {
    const full = car("suv");
    const tight = car("suv", 0.82);
    const width = (parts: Part[]) => {
      const body = parts.find((part) => part.id.endsWith("/body"))!;
      const box = bounds(body);
      return box.maxX - box.minX;
    };
    const height = (parts: Part[]) => {
      const body = parts.find((part) => part.id.endsWith("/body"))!;
      const box = bounds(body);
      return box.maxY - box.minY;
    };
    // Uniform scaling only: the old code scaled Z alone and produced ellipses
    // where wheels should be.
    const sx = width(tight) / width(full);
    const sy = height(tight) / height(full);
    expect(sx).toBeCloseTo(0.82, 2);
    expect(sy).toBeCloseTo(sx, 2);
  });

  it("keeps every wheel round under a tight bay", () => {
    for (const part of car("coupe", 0.8).filter((entry) => entry.id.endsWith("/tyre"))) {
      const box = bounds(part);
      // The tyre is a cylinder on the X axis: its disc must stay circular in YZ.
      expect(box.maxY - box.minY).toBeCloseTo(box.maxZ - box.minZ, 2);
    }
  });

  it("keeps the alloy recessed inside the tyre", () => {
    // Ordering on the X axis, outside-in: tyre sidewall → alloy face → spokes →
    // hub. Anything proud of the tyre becomes a fin on the flank.
    for (const style of STYLES) {
      const parts = car(style);
      const outer = (suffix: string) => {
        const part = parts.find((entry) => entry.id.endsWith(suffix))!;
        const box = bounds(part);
        return Math.max(Math.abs(box.minX), Math.abs(box.maxX));
      };
      const tyre = outer("/tyre");
      expect(outer("/alloy"), `${style} alloy`).toBeLessThan(tyre);
      expect(outer("/spoke-0"), `${style} spoke`).toBeLessThan(tyre);
      expect(outer("/hub"), `${style} hub`).toBeLessThan(tyre);
    }
  });

  it("keeps the tyres the widest part of the car, mirrors aside", () => {
    for (const style of STYLES) {
      const parts = car(style);
      const widest = parts
        .filter((part) => !part.id.includes("/mirror"))
        .reduce((acc, part) => {
          const box = bounds(part);
          return Math.max(acc, Math.abs(box.minX), Math.abs(box.maxX));
        }, 0);
      const body = parts.find((part) => part.id.endsWith("/body"))!;
      const bodyHalf = Math.max(Math.abs(bounds(body).minX), Math.abs(bounds(body).maxX));
      // The wheels stand very slightly proud of the coachwork — a fraction of the
      // body half width, not a plate bolted onto it.
      expect(widest).toBeLessThan(bodyHalf + 0.09);
    }
  });

  it("counts its lofts in the triangle budget", () => {
    // The audit skipped the loft case entirely at first, so the cars' bodies cost
    // nothing in the reported budget. A vehicle must never be free.
    const budget = partTriangleBudget(car("suv"));
    expect(budget).toBeGreaterThan(1500);
  });

  it("merges into the plot's material buckets", () => {
    for (const style of STYLES) {
      const merged = mergePartsByMaterial(car(style));
      // The paint bucket must exist and carry the coachwork.
      expect(merged.carPaint0).toBeDefined();
      expect(merged.carPaint0!.getAttribute("position").count).toBeGreaterThan(100);
      for (const key of ["charcoal", "metal", "carGlass"] as const) {
        expect(merged[key], key).toBeDefined();
      }
    }
  });
});
