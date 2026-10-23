import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { HOUSE_CONFIG, houseHeaderHeight } from "@/components/three/house-geometry";
import { facadeNormal, fitDistance, footprintFor, houseFrame, houseRadius } from "@/lib/3d/framing";

/**
 * Framing is geometry, so it can be tested as geometry.
 *
 * The defect being guarded against: the old rig took its view direction from the
 * house's *world coordinates*, so a house in the north row (facing south, toward
 * the garden) was photographed from the north — from behind, looking at the rear
 * elevation. These tests assert, for every house actually placed on this site,
 * that the camera ends up in front of the facade.
 */

const UNIT_FOR = (code: string) => SEED_UNITS.find((unit) => unit.code === code)!;

const frameFor = (code: string, view?: Parameters<typeof houseFrame>[0]["view"]) => {
  const unit = UNIT_FOR(code);
  const header = houseHeaderHeight(HOUSE_CONFIG[unit.typology]!);
  return {
    unit,
    header,
    frame: houseFrame({
      position: { x: unit.position.x, z: unit.position.z },
      rotationY: unit.position.rotationY,
      footprint: footprintFor(unit.typology, header),
      view,
    }),
  };
};

describe("framing for every house on the site", () => {
  it.each(SEED_UNITS.map((unit) => [unit.code, unit]))("frames %s from the front", (code, unit) => {
    const { frame } = frameFor(code);
    const normal = facadeNormal(unit.position.rotationY);
    // Vector from the house to the camera, projected on the facade normal.
    const dx = frame.position.x - unit.position.x;
    const dz = frame.position.z - unit.position.z;
    const inFront = dx * normal.x + dz * normal.z;
    // Strictly in front: the hero view must show the entrance elevation.
    expect(inFront, `${code} is framed from behind`).toBeGreaterThan(1);
  });

  it.each(SEED_UNITS.map((unit) => [unit.code, unit]))("keeps the camera outside %s", (code, unit) => {
    const { frame } = frameFor(code);
    const plan = footprintFor(unit.typology, 0);
    const dx = Math.abs(frame.position.x - unit.position.x);
    const dz = Math.abs(frame.position.z - unit.position.z);
    // Outside the half-diagonal plus a metre, so the camera is never in a wall.
    expect(Math.hypot(dx, dz)).toBeGreaterThan(Math.max(plan.width, plan.depth) / 2 + 1);
    expect(frame.position.y).toBeGreaterThan(2);
  });

  it.each(SEED_UNITS.map((unit) => [unit.code, unit]))("looks at %s, not over it", (code, unit) => {
    const { frame, header } = frameFor(code);
    expect(frame.target.x).toBeCloseTo(unit.position.x, 6);
    expect(frame.target.z).toBeCloseTo(unit.position.z, 6);
    // Aimed at the volume, above grade and below the roof.
    expect(frame.target.y).toBeGreaterThan(1);
    expect(frame.target.y).toBeLessThan(header);
  });

  it("never returns two identical frames for different houses", () => {
    const seen = new Set<string>();
    for (const unit of SEED_UNITS) {
      const { frame } = frameFor(unit.code);
      const key = `${frame.position.x.toFixed(1)}:${frame.position.z.toFixed(1)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("named views", () => {
  it("gives every view a different composition", () => {
    const views = ["hero", "threeQuarter", "facade", "aerial", "detail", "context"] as const;
    const frames = views.map((view) => frameFor("H01", view).frame);
    const keys = frames.map((frame) => `${frame.position.x.toFixed(1)}:${frame.position.y.toFixed(1)}`);
    expect(new Set(keys).size).toBe(views.length);
  });

  it("puts the aerial view above every other view", () => {
    const aerial = frameFor("H03", "aerial").frame;
    for (const view of ["hero", "facade", "detail"] as const) {
      expect(aerial.position.y).toBeGreaterThan(frameFor("H03", view).frame.position.y);
    }
  });

  it("keeps the detail view closer than the context view", () => {
    const detail = frameFor("H04", "detail").frame;
    const context = frameFor("H04", "context").frame;
    const unit = UNIT_FOR("H04");
    const d = (position: { x: number; z: number }) => Math.hypot(position.x - unit.position.x, position.z - unit.position.z);
    expect(d(detail.position)).toBeLessThan(d(context.position));
  });

  it("never cuts the roof: the whole height fits the vertical field", () => {
    for (const unit of SEED_UNITS) {
      const { frame, header } = frameFor(unit.code);
      const distance = Math.hypot(frame.position.x - unit.position.x, frame.position.z - unit.position.z);
      const fov = (36 * Math.PI) / 180;
      const visible = 2 * distance * Math.tan(fov / 2);
      expect(visible, `${unit.code} frame cannot hold a ${header.toFixed(1)} m house`).toBeGreaterThan(header);
    }
  });
});

describe("framing maths", () => {
  it("keeps the fit distance above the half-diagonal", () => {
    const radius = houseRadius({ width: 10, depth: 12, height: 6 });
    expect(fitDistance(radius, 36)).toBeGreaterThan(radius * 1.4);
  });

  it("stands further back for a bigger subject", () => {
    expect(fitDistance(12, 36)).toBeGreaterThan(fitDistance(6, 36));
  });

  it("rotates the facade normal with the house", () => {
    expect(facadeNormal(0)).toEqual({ x: 0, z: 1 });
    const right = facadeNormal(90);
    expect(right.x).toBeCloseTo(1, 6);
    expect(right.z).toBeCloseTo(0, 6);
    const back = facadeNormal(180);
    expect(back.z).toBeCloseTo(-1, 6);
  });
});
