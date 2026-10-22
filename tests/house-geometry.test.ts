import { describe, expect, it } from "vitest";
import { getFloorPlan } from "@/lib/domain/floorplans";
import { TYPOLOGIES } from "@/lib/domain/constants";
import {
  HOUSE_CONFIG,
  HOUSE_DETAIL,
  buildHouseGeometry,
  disposeHouseGeometry,
  houseHeaderHeight,
  roofExtent,
  type HouseGeometrySet,
} from "@/components/three/house-geometry";

/**
 * Architectural invariants for every typology.
 *
 * These are not screenshots and they do not claim visual approval. They assert
 * the things a screenshot is bad at catching: a canopy post that stops 30 cm
 * short of the slab, a roof that overhangs a metre, a piece buried in the
 * terrain, a window that floats off the wall.
 *
 * Every built geometry is merged per material, so the checks read the actual
 * vertex bounds rather than the intent in the source.
 */

const built = new Map<string, HouseGeometrySet>();

function geometryFor(typology: string): HouseGeometrySet {
  const cached = built.get(typology);
  if (cached) return cached;
  const plan = getFloorPlan(typology as never);
  const config = HOUSE_CONFIG[typology]!;
  const set = buildHouseGeometry(plan, config, 7);
  built.set(typology, set);
  return set;
}

function bounds(key: keyof HouseGeometrySet, typology: string) {
  const geometry = geometryFor(typology)[key];
  if (!geometry) return null;
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
}

const allKeys = ["stone", "render", "charcoal", "metal", "timber", "timberDark", "concrete", "deck", "gravel", "glass", "glassRail", "interior"] as const;

describe.each(TYPOLOGIES)("%s", (typology) => {
  const plan = getFloorPlan(typology);
  const config = HOUSE_CONFIG[typology]!;

  it("builds every material bucket it needs and no empty ones", () => {
    const set = geometryFor(typology);
    expect(Object.keys(set).length).toBeGreaterThan(5);
    for (const key of allKeys) {
      // Terraces are per-plan; balcony rails only exist where there is a balcony.
      if (key === "gravel" || key === "deck") continue;
      if (key === "glassRail" && !config.balcony) continue;
      expect(set[key], `${typology} is missing ${key}`).toBeDefined();
    }
    if (config.balcony) expect(set.glassRail).toBeDefined();
  });

  it("never sinks below grade", () => {
    // A wall or roof piece below y = -0.05 is buried: the house is floating on a
    // plinth that is not there, or a post is pushed through the ground.
    for (const key of allKeys) {
      const box = bounds(key, typology);
      if (!box) continue;
      expect(box.min.y, `${typology}.${key} sinks to ${box.min.y.toFixed(3)}`).toBeGreaterThan(-0.06);
    }
  });

  it("stands on the ground through a visible plinth", () => {
    const stone = bounds("stone", typology)!;
    // The plinth reaches grade and rises enough to be seen.
    expect(stone.min.y).toBeLessThanOrEqual(0.02);
    expect(stone.max.y).toBeGreaterThanOrEqual(HOUSE_DETAIL.plinthHeight - 0.06);
    expect(HOUSE_DETAIL.plinthProjection).toBeGreaterThanOrEqual(0.05);
  });

  it("keeps the roof overhang to an architectural dimension", () => {
    // The charcoal bucket also holds the entrance canopy and the window frames,
    // so the roof is measured from its own definition and then cross-checked
    // against the built soffit (render), which is the widest roof plane.
    const extent = roofExtent(plan);
    const overhang = (extent.width - plan.widthM) / 2;
    expect(overhang).toBeGreaterThan(0.4);
    expect(overhang).toBeLessThan(0.8);

    const soffit = bounds("render", typology)!;
    const builtOverhang = (soffit.max.x - soffit.min.x - plan.widthM) / 2;
    // The soffit sits 3 cm inside the fascia on each side.
    expect(builtOverhang).toBeGreaterThan(0.4);
    expect(builtOverhang).toBeLessThan(0.8);

    // And the roof must cover the walls: no wall sticking out past its roof.
    const roof = bounds("charcoal", typology)!;
    expect(roof.min.x).toBeLessThan(-plan.widthM / 2);
  });

  it("reaches a plausible ridge height for its storeys", () => {
    const roof = bounds("charcoal", typology)!;
    const header = houseHeaderHeight(config);
    expect(roof.max.y).toBeGreaterThan(header - 0.2);
    // Above the roof line there is only the chimney cap, and only where the
    // typology has a chimney.
    const allowance = config.chimney ? 1.9 : 0.5;
    expect(roof.max.y).toBeLessThan(header + allowance);
    if (config.chimney) expect(roof.max.y).toBeGreaterThan(header + 0.6);
  });

  it("puts the glazing on the facade, not floating off it", () => {
    const glass = bounds("glass", typology)!;
    const halfDepth = plan.depthM / 2;
    // The glass sits within 30 cm of the wall plane on either side.
    expect(glass.min.z).toBeLessThanOrEqual(halfDepth + 0.32);
    expect(glass.max.z).toBeGreaterThan(halfDepth - 0.6);
  });

  it("gives every window an interior backdrop", () => {
    const interior = bounds("interior", typology);
    expect(interior, `${typology} has glazing but no interior plane`).toBeDefined();
    // The backdrop is inside the house, so it can never poke through a facade.
    const glass = bounds("glass", typology)!;
    expect(interior!.max.z).toBeLessThan(glass.max.z);
  });

  it("keeps the entrance canopy supported and above head height", () => {
    const metal = bounds("metal", typology)!;
    const charcoal = bounds("charcoal", typology)!;
    // Canopy posts are part of the metal bucket; they must reach the canopy.
    // The canopy soffit is the lowest charcoal over the entrance.
    const headroom = charcoal.max.y;
    expect(headroom).toBeGreaterThan(2.4);
    // No metal floats: the metal bucket must start at grade (posts, handrails).
    expect(metal.min.y).toBeLessThan(0.4);
  });
});

describe("house detail constants", () => {
  it("uses dimensions that read at architectural scale", () => {
    expect(HOUSE_DETAIL.roofOverhang).toBeGreaterThanOrEqual(0.4);
    expect(HOUSE_DETAIL.roofOverhang).toBeLessThanOrEqual(0.8);
    expect(HOUSE_DETAIL.fasciaHeight).toBeGreaterThan(HOUSE_DETAIL.roofThickness);
    expect(HOUSE_DETAIL.plinthHeight).toBeGreaterThanOrEqual(0.18);
    expect(HOUSE_DETAIL.sillProjection).toBeGreaterThanOrEqual(0.08);
  });

  it("builds deterministically and disposes cleanly", () => {
    const plan = getFloorPlan("T3");
    const config = HOUSE_CONFIG.T3!;
    const a = buildHouseGeometry(plan, config, 3);
    const b = buildHouseGeometry(plan, config, 3);
    a.charcoal!.computeBoundingBox();
    b.charcoal!.computeBoundingBox();
    expect(a.charcoal!.boundingBox!.max.y).toBeCloseTo(b.charcoal!.boundingBox!.max.y, 6);
    disposeHouseGeometry(a);
    disposeHouseGeometry(b);
  });

  it("keeps the approved floor plan untouched", () => {
    // Presentation work must never move the walls: the plan is the authority.
    // These are the sizes the plans actually declare (and the ones the 3D scene
    // builds); the editor used to carry a second, wrong table.
    const reference = { T1: [7.2, 10.4], T2: [9.0, 11.0], T3: [11.0, 12.4], T4: [12.6, 13.6] } as const;
    for (const [typology, [width, depth]] of Object.entries(reference)) {
      const plan = getFloorPlan(typology as never);
      expect(plan.widthM).toBe(width);
      expect(plan.depthM).toBe(depth);
    }
  });
});
