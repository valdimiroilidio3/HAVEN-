import { readFileSync } from "node:fs";
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
import { partBounds, plotParts, type Part } from "@/lib/3d/parts";
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
    // One medium is known and deliberate: H13's plot leaves 1.85 m between its
    // wall and the kerb, so the verge footpath cannot fit. Resolving it moves
    // approved plot geometry, so it stays visible instead of being swallowed.
    expect(text.split("\n")[1]).toMatch(/^findings: 0 critical, 0 high, 1 medium, 0 low$/);
    const medium = report.findings.filter((f) => f.severity === "medium");
    expect(medium).toHaveLength(1);
    expect(medium[0]!.objectId).toBe("path/ring-outer:walk:2");
    expect(medium[0]!.subject).toBe("H13");
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

describe("scene validation — objects may not occupy the house or the pool", () => {
  const withExtra = (extra: (input: Parameters<typeof plotParts>[0]) => Part[]) => (input: Parameters<typeof plotParts>[0]) => [
    ...plotParts(input),
    ...extra(input),
  ];

  it("flags garden planting that grows outside its plot", () => {
    const report = validateScene({
      entries,
      vegetation: false,
      layout: withExtra(() => [
        {
          id: "H01/test/hedge-outside",
          group: "planting",
          material: "hedge",
          shape: { kind: "box", size: [2, 0.7, 0.7], position: [0, 0.35, -40] },
        },
      ]),
    });
    const hit = report.findings.find((finding) => finding.objectId === "H01/test/hedge-outside");
    expect(hit?.severity).toBe("high");
    expect(hit?.category).toBe("boundary");
  });

  it("flags an object placed inside its own house", () => {
    const report = validateScene({
      entries,
      vegetation: false,
      layout: withExtra(() => [
        {
          id: "H01/test/planter",
          group: "furniture",
          material: "stone",
          shape: { kind: "box", size: [1.4, 0.8, 1.4], position: [0, 0.4, 0] },
        },
      ]),
    });
    const hit = report.findings.find((finding) => finding.objectId === "H01/test/planter");
    expect(hit?.severity).toBe("high");
    expect(hit?.category).toBe("overlap");
    expect(hit?.message).toContain("inside its own house");
  });

  it("flags planting on top of a pool deck", () => {
    const report = validateScene({
      entries,
      vegetation: false,
      layout: withExtra((input) =>
        input.pool
          ? [
              {
                id: "H01/test/tree-in-pool",
                group: "planting",
                material: "trunk",
                shape: { kind: "cylinder", size: [0.1, 0.14, 2], position: [input.pool.x, 1, input.pool.z] },
              },
            ]
          : [],
      ),
    });
    const hit = report.findings.find((finding) => finding.objectId === "H01/test/tree-in-pool");
    // H01 may have no pool; the finding must appear for whichever plot does.
    const poolPlot = SEED_UNITS.find((unit) => {
      const depth = plotRearDepth({ x: unit.position.x, z: unit.position.z }, unit.position.rotationY, unit.typology);
      return poolFor(unit.code, unit.typology, depth) !== null;
    });
    const pooled = validateScene({
      entries: poolPlot ? [poolPlotEntry(poolPlot)] : entries,
      vegetation: false,
      layout: withExtra((input) =>
        input.pool
          ? [
              {
                id: `${input.code}/test/tree-in-pool`,
                group: "planting",
                material: "trunk",
                shape: { kind: "cylinder", size: [0.1, 0.14, 2], position: [input.pool.x, 1, input.pool.z] },
              },
            ]
          : [],
      ),
    });
    expect(hit === undefined || hit.severity === "high").toBe(true);
    expect(pooled.findings.some((finding) => finding.message.includes("overlaps the pool deck"))).toBe(true);
  });
});

function poolPlotEntry(unit: (typeof SEED_UNITS)[number]): SceneEntryInput {
  return {
    property: { code: unit.code, typology: unit.typology },
    position: { x: unit.position.x, z: unit.position.z },
    rotationY: unit.position.rotationY,
  };
}

describe("garden planting — measured from the plot, not the façade", () => {
  const plots = entries.map((entry) => {
    const position = { x: entry.position.x, z: entry.position.z };
    const rearDepth = plotRearDepth(position, entry.rotationY, entry.property.typology);
    const plan = garagePlan(position, entry.rotationY, entry.property.typology);
    const pool = poolFor(entry.property.code, entry.property.typology, rearDepth);
    const parts = plotParts({
      code: entry.property.code,
      rearDepth,
      walls: plotWallsFor(entry.property.typology, rearDepth),
      garage: plan.garage,
      pool,
      seed: 1,
      lowQuality: false,
    });
    const bounds = (id: string) => {
      const part = parts.find((candidate) => candidate.id === id);
      return part ? partBounds(part, position, entry.rotationY) : null;
    };
    const planting = parts.filter((part) => part.group === "planting");
    const boundary = parts.filter((part) => part.group === "boundary");
    const plotOuter = boundary.reduce(
      (rect, part) => {
        const b = partBounds(part, position, entry.rotationY);
        return {
          minX: Math.min(rect.minX, b.minX),
          maxX: Math.max(rect.maxX, b.maxX),
          minZ: Math.min(rect.minZ, b.minZ),
          maxZ: Math.max(rect.maxZ, b.maxZ),
        };
      },
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    return { code: entry.property.code, parts, planting, plotOuter, position, rotationY: entry.rotationY, bounds, pool };
  });

  it("gives every plot some garden planting", () => {
    for (const plot of plots) expect(plot.planting.length).toBeGreaterThan(0);
  });

  it("never puts a plant outside its own boundary walls", () => {
    for (const plot of plots) {
      for (const part of plot.planting) {
        const b = partBounds(part, plot.position, plot.rotationY);
        expect(b.minX, `${part.id} · minX`).toBeGreaterThanOrEqual(plot.plotOuter.minX - 0.02);
        expect(b.maxX, `${part.id} · maxX`).toBeLessThanOrEqual(plot.plotOuter.maxX + 0.02);
        expect(b.minZ, `${part.id} · minZ`).toBeGreaterThanOrEqual(plot.plotOuter.minZ - 0.02);
        expect(b.maxZ, `${part.id} · maxZ`).toBeLessThanOrEqual(plot.plotOuter.maxZ + 0.02);
      }
    }
  });

  it("never puts a plant on a pool deck", () => {
    for (const plot of plots) {
      const deckPart = plot.parts.find((part) => part.id.endsWith("/pool/deck"));
      if (!deckPart) continue;
      const deck = partBounds(deckPart, plot.position, plot.rotationY);
      for (const part of plot.planting) {
        const b = partBounds(part, plot.position, plot.rotationY);
        const w = Math.min(b.maxX, deck.maxX) - Math.max(b.minX, deck.minX);
        const d = Math.min(b.maxZ, deck.maxZ) - Math.max(b.minZ, deck.minZ);
        expect(w <= 0 || d <= 0, `${part.id} overlaps the deck`).toBe(true);
      }
    }
  });

  it("keeps the house mesh free of vegetation", () => {
    // The baked planting was removed from house-geometry: a house must not
    // carry trees, because it has no idea where the plot walls are.
    const source = readFileSync(new URL("../src/components/three/house-geometry.ts", import.meta.url), "utf8");
    expect(source).not.toContain("addPlanting");
    expect(source).not.toContain("foliage");
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

  it("keeps the heaviest plot inside its triangle budget", () => {
    // Three real cars per double-bay plot is the expensive case. 6,000 triangles
    // for a fully fitted plot (two cars, pool, deck, planting) is the ceiling;
    // the previous props sat at 15.5k for the whole site, the current ones at
    // ~50k, which is still an order of magnitude below the terrain.
    const report = validateScene({
      entries: SEED_UNITS.map((unit) => ({
        property: { code: unit.code, typology: unit.typology },
        position: unit.position,
        rotationY: unit.position.rotationY,
      })),
    });
    expect(report.checked.worstPlotTriangles).toBeLessThan(6000);
    expect(report.checked.worstPlotTriangles).toBeGreaterThan(2000);
  });

  it("merges into a handful of draw calls, not one per part", () => {
    const materials = new Set(parts.map((part) => part.material));
    expect(parts.length).toBeGreaterThan(20);
    // Walls, carport, two cars, pool, deck, furniture, hedge and three foliage
    // variants: thirteen materials is the ceiling, merged into one mesh each.
    expect(materials.size).toBeLessThanOrEqual(14);
  });
});
