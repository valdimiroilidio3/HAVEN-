import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import {
  PLANTING_BEDS,
  SITE,
  flowerBeds,
  lampPositions,
  plantingBeds,
  plotFootprints,
  plotRearDepth,
  pointInRect,
  pointOnRoad,
  scatterFlowers,
  scatterShrubs,
  scatterTrees,
  type Rect,
} from "@/lib/3d/site";
import { SPATIAL_RULES, formatReport, validateScene, type SceneEntryInput } from "@/lib/3d/validate";
import { partBounds, plotParts } from "@/lib/3d/parts";
import { garagePlan, plotWallsFor, poolFor } from "@/lib/3d/site";

const entries: SceneEntryInput[] = SEED_UNITS.map((unit) => ({
  property: { code: unit.code, typology: unit.typology },
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
}));

const houses = entries.map((entry) => ({
  position: entry.position,
  typology: entry.property.typology,
  rotationY: entry.rotationY,
}));

const footprints = plotFootprints(houses);

describe("scene validation — the shipped masterplan", () => {
  const report = validateScene({ entries });

  it("places every plot and part it claims to check", () => {
    expect(report.checked.houses).toBe(13);
    expect(report.checked.plots).toBe(13);
    expect(report.checked.carports).toBe(13);
    expect(report.checked.parts).toBeGreaterThan(500);
  });

  it("reports no critical or high findings", () => {
    expect(report.findings.filter((f) => f.severity === "critical")).toEqual([]);
    expect(report.findings.filter((f) => f.severity === "high")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("prints a one-line-per-finding report", () => {
    const text = formatReport(report);
    expect(text).toContain("13 houses · 13 plots");
    expect(text.split("\n")[1]).toMatch(/^findings: 0 critical, 0 high, 0 medium, 0 low$/);
  });

  it("documents the rules it enforces", () => {
    expect(SPATIAL_RULES.length).toBeGreaterThanOrEqual(8);
    expect(SPATIAL_RULES.join(" ")).toMatch(/carriageway/);
  });
});

describe("scene validation — the rules actually fire", () => {
  it("flags a house dropped on the ring road as critical", () => {
    const onRoad: SceneEntryInput = {
      property: { code: "H99", typology: "T3" },
      position: { x: -30, z: SITE.ring.outer.minZ },
      rotationY: 0,
    };
    const report = validateScene({ entries: [...entries, onRoad], vegetation: false });
    const hit = report.findings.find((f) => f.subject === "H99" && f.category === "circulation");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("critical");
    expect(hit!.confirmed).toBe(true);
    expect(report.ok).toBe(false);
  });

  it("flags two houses in the same place as critical overlap", () => {
    const clone: SceneEntryInput = {
      property: { code: "H98", typology: entries[0]!.property.typology },
      position: entries[0]!.position,
      rotationY: entries[0]!.rotationY,
    };
    const report = validateScene({ entries: [...entries, clone], vegetation: false });
    const hit = report.findings.find((f) => f.category === "overlap" && f.severity === "critical");
    expect(hit).toBeDefined();
  });

  it("flags a house outside the perimeter fence", () => {
    const outside: SceneEntryInput = {
      property: { code: "H97", typology: "T2" },
      position: { x: SITE.fence.maxX + 20, z: 0 },
      rotationY: 0,
    };
    const report = validateScene({ entries: [...entries, outside], vegetation: false });
    expect(report.findings.some((f) => f.subject === "H97" && f.category === "boundary" && f.severity === "critical")).toBe(true);
  });

  it("every finding carries an id, a suggestion and a confirmed flag", () => {
    const report = validateScene({ entries: [...entries, { ...entries[0]!, property: { code: "H96", typology: "T2" } }], vegetation: false });
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(finding.objectId.length).toBeGreaterThan(0);
      expect(finding.suggestion.length).toBeGreaterThan(10);
      expect(typeof finding.confirmed).toBe("boolean");
      expect(["circulation", "overlap", "boundary", "clearance", "composition", "grounding"]).toContain(finding.category);
    }
  });
});

describe("placement rules — private plots are keep-out zones", () => {
  const rects: Rect[] = footprints;

  it("never scatters a tree inside a plot", () => {
    const trees = scatterTrees({ houses, count: 96, keepOut: [], exclude: rects });
    for (const tree of trees) {
      expect(rects.some((rect) => pointInRect(tree.x, tree.z, rect))).toBe(false);
    }
  });

  it("never scatters a shrub or a flower inside a plot", () => {
    for (const shrub of scatterShrubs(houses, 913, rects)) {
      expect(rects.some((rect) => pointInRect(shrub.x, shrub.z, rect))).toBe(false);
    }
    for (const flower of scatterFlowers(4242, rects)) {
      expect(rects.some((rect) => pointInRect(flower.x, flower.z, rect))).toBe(false);
    }
  });

  it("clips the planting beds so no bed edge crosses a garden wall", () => {
    const beds = plantingBeds(rects);
    const area = (list: Array<Rect>) => list.reduce((sum, bed) => sum + (bed.maxX - bed.minX) * (bed.maxZ - bed.minZ), 0);
    expect(beds.length).toBeGreaterThan(0);
    expect(area(beds)).toBeLessThan(area(PLANTING_BEDS));
    for (const bed of beds) {
      for (const rect of rects) {
        const w = Math.min(bed.maxX, rect.maxX) - Math.max(bed.minX, rect.minX);
        const d = Math.min(bed.maxZ, rect.maxZ) - Math.max(bed.minZ, rect.minZ);
        expect(w <= 0 || d <= 0).toBe(true);
      }
    }
  });

  it("clips flower borders the same way", () => {
    for (const bed of flowerBeds(rects)) {
      for (const rect of rects) {
        const w = Math.min(bed.maxX, rect.maxX) - Math.max(bed.minX, rect.minX);
        const d = Math.min(bed.maxZ, rect.maxZ) - Math.max(bed.minZ, rect.minZ);
        expect(w <= 0 || d <= 0).toBe(true);
      }
    }
  });

  it("puts lamps beside the road and never inside a plot", () => {
    const lamps = lampPositions(rects);
    expect(lamps.length).toBeGreaterThan(8);
    for (const lamp of lamps) {
      expect(rects.some((rect) => pointInRect(lamp.x, lamp.z, rect))).toBe(false);
      expect(pointOnRoad(lamp.x, lamp.z, -0.5)).toBe(false);
    }
  });
});

describe("plot geometry — parts are placed by rule, not by eye", () => {
  const unit = SEED_UNITS[0]!;
  const rearDepth = plotRearDepth({ x: unit.position.x, z: unit.position.z }, unit.position.rotationY, unit.typology);
  const { garage } = garagePlan({ x: unit.position.x, z: unit.position.z }, unit.position.rotationY, unit.typology);
  const walls = plotWallsFor(unit.typology, rearDepth);
  const pool = poolFor(unit.code, unit.typology, rearDepth);
  const parts = plotParts({ code: unit.code, rearDepth, walls, garage, pool, seed: 1, lowQuality: true });

  it("uses unique part ids so findings point at one object", () => {
    const ids = parts.map((part) => part.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the walled garden inside the plot footprint", () => {
    const [footprint] = plotFootprints([houses[0]!]);
    const walled = parts.filter((part) => part.group === "boundary" || part.group === "pool" || part.group === "deck" || part.group === "furniture");
    expect(walled.length).toBeGreaterThan(4);
    for (const part of walled) {
      const bounds = partBounds(part, { x: unit.position.x, z: unit.position.z }, unit.position.rotationY);
      expect(bounds.minX).toBeGreaterThanOrEqual(footprint!.minX - 0.6);
      expect(bounds.maxX).toBeLessThanOrEqual(footprint!.maxX + 0.6);
      expect(bounds.minZ).toBeGreaterThanOrEqual(footprint!.minZ - 0.6);
      expect(bounds.maxZ).toBeLessThanOrEqual(footprint!.maxZ + 0.6);
    }
  });

  it("never parks a carport or a car on the carriageway", () => {
    // The carport lives in the front setback, outside the walled garden, so the
    // footprint test above does not cover it. The road test does.
    for (const entry of entries) {
      const pos = { x: entry.position.x, z: entry.position.z };
      const depth = plotRearDepth(pos, entry.rotationY, entry.property.typology);
      const plan = garagePlan(pos, entry.rotationY, entry.property.typology);
      const plot = plotParts({
        code: entry.property.code,
        rearDepth: depth,
        walls: plotWallsFor(entry.property.typology, depth),
        garage: plan.garage,
        pool: poolFor(entry.property.code, entry.property.typology, depth),
        seed: 1,
        lowQuality: true,
      });
      for (const part of plot.filter((p) => p.group === "carport" || p.group === "car")) {
        const b = partBounds(part, pos, entry.rotationY);
        expect(pointOnRoad(b.minX, b.minZ, 0)).toBe(false);
        expect(pointOnRoad(b.maxX, b.maxZ, 0)).toBe(false);
        expect(pointOnRoad((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, 0)).toBe(false);
      }
    }
  });

  it("rotates bounds with the plot", () => {
    const part = {
      id: "test",
      group: "boundary" as const,
      material: "render" as const,
      shape: { kind: "box" as const, size: [4, 1, 0.2] as [number, number, number], position: [2, 0.5, 0] as [number, number, number] },
    };
    const straight = partBounds(part, { x: 0, z: 0 }, 0);
    const turned = partBounds(part, { x: 0, z: 0 }, 90);
    expect(straight.maxX - straight.minX).toBeCloseTo(4, 5);
    expect(turned.maxZ - turned.minZ).toBeCloseTo(4, 5);
    expect(turned.maxX - turned.minX).toBeCloseTo(0.2, 5);
  });

  it("merges into a handful of draw calls, not one per part", () => {
    const materials = new Set(parts.map((part) => part.material));
    expect(parts.length).toBeGreaterThan(20);
    expect(materials.size).toBeLessThanOrEqual(10);
  });
});
