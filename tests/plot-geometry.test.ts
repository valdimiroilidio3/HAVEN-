import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { garagePlan, plotRearDepth, plotWallsFor, poolFor } from "@/lib/3d/site";
import { buildPlotGeometries, disposePlotGeometries, plotGeometryStats } from "@/components/three/site/plot-geometry";

/**
 * The renderer's plot meshes built headlessly.
 *
 * There is no GPU in this environment, so this is the closest thing to a draw
 * test: it exercises the same merge path the browser uses (primitives →
 * per-material BufferGeometry) and fails if a plot produces empty, broken or
 * unreasonably heavy geometry.
 */

function inputFor(unit: (typeof SEED_UNITS)[number], lowQuality: boolean) {
  const position = { x: unit.position.x, z: unit.position.z };
  const rearDepth = plotRearDepth(position, unit.position.rotationY, unit.typology);
  const { garage } = garagePlan(position, unit.position.rotationY, unit.typology);
  return {
    code: unit.code,
    rearDepth,
    walls: plotWallsFor(unit.typology, rearDepth),
    garage,
    pool: poolFor(unit.code, unit.typology, rearDepth),
    seed: 1,
    lowQuality,
  };
}

describe("plot geometry merging", () => {
  it("builds non-empty geometry for every material the plot uses", () => {
    const input = inputFor(SEED_UNITS[0]!, false);
    const { parts, geometries } = buildPlotGeometries(input);
    const materials = new Set(parts.map((part) => part.material));
    expect(Object.keys(geometries).length).toBeGreaterThan(0);
    for (const material of materials) {
      const geometry = geometries[material];
      expect(geometry, `missing geometry for ${material}`).toBeDefined();
      expect(geometry!.getAttribute("position").count).toBeGreaterThan(0);
    }
  });

  it("keeps merged geometry inside the plot plus the carport apron", () => {
    for (const unit of SEED_UNITS) {
      const input = inputFor(unit, true);
      const { geometries } = buildPlotGeometries(input);
      for (const [material, geometry] of Object.entries(geometries)) {
        geometry!.computeBoundingBox();
        const box = geometry!.boundingBox as THREE.Box3;
        expect(box.isEmpty()).toBe(false);
        for (const value of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) {
          expect(Number.isFinite(value), `${unit.code}/${material} has a non-finite bound`).toBe(true);
        }
        // Sanity envelope: a T4 plot (wide house, 11 m rear garden and the
        // carport apron) reaches ~29 m front to back. Anything past this means
        // a part has escaped the plot, which the validator would flag too.
        expect(box.max.x - box.min.x).toBeLessThan(40);
        expect(box.max.z - box.min.z).toBeLessThan(34);
        expect(box.max.y).toBeLessThan(6);
      }
    }
  });

  it("caches per plot and stays bounded", () => {
    disposePlotGeometries();
    expect(plotGeometryStats().plots).toBe(0);
    for (const unit of SEED_UNITS.slice(0, 3)) buildPlotGeometries(inputFor(unit, true));
    const afterFirst = plotGeometryStats();
    expect(afterFirst.plots).toBe(3);
    for (const unit of SEED_UNITS.slice(0, 3)) buildPlotGeometries(inputFor(unit, true));
    expect(plotGeometryStats().plots).toBe(afterFirst.plots);
    expect(afterFirst.drawCalls).toBeGreaterThan(0);
  });

  it("produces fewer meshes than parts", () => {
    const input = inputFor(SEED_UNITS[0]!, false);
    const { parts, geometries } = buildPlotGeometries(input);
    expect(parts.length).toBeGreaterThan(20);
    expect(Object.keys(geometries).length).toBeLessThan(parts.length / 2);
  });
});
