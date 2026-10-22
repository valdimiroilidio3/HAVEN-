import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { SITE } from "@/lib/3d/site";
import { partBounds } from "@/lib/3d/parts";
import {
  angleDistance,
  inLagoonWater,
  insideDeckEllipse,
  lagoonLayout,
  onDeckRing,
  onLagoonDeck,
} from "@/lib/3d/lagoon";
import { validateScene, type SceneEntryInput } from "@/lib/3d/validate";
import { buildLagoonGeometries, disposeLagoonGeometries, lagoonGeometryStats } from "@/components/three/site/lagoon-geometry";

const entries: SceneEntryInput[] = SEED_UNITS.map((unit) => ({
  property: { code: unit.code, typology: unit.typology },
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
}));

const world = (part: ReturnType<typeof lagoonLayout>["parts"][number]) =>
  partBounds(part, { x: SITE.lagoon.x, z: SITE.lagoon.z }, 0);

describe("lagoon ring maths", () => {
  it("puts t=0 on the water edge and t=1 on the paved edge", () => {
    for (const angle of [0, 45, 90, 137, 180, 270]) {
      const water = onDeckRing(angle, 0);
      const edge = onDeckRing(angle, 1);
      expect(Math.abs(water.x)).toBeLessThanOrEqual(SITE.lagoon.radiusX + 1e-9);
      expect(Math.abs(water.z)).toBeLessThanOrEqual(SITE.lagoon.radiusZ + 1e-9);
      // The outer point is exactly on the drawn deck ellipse.
      expect(insideDeckEllipse(SITE.lagoon.x + edge.x, SITE.lagoon.z + edge.z)).toBe(true);
      expect(Math.abs(edge.x)).toBeCloseTo(Math.abs(Math.cos((angle * Math.PI) / 180)) * (SITE.lagoon.radiusX + SITE.lagoon.deck), 6);
    }
  });

  it("classifies water and deck correctly", () => {
    const centre = { x: SITE.lagoon.x, z: SITE.lagoon.z };
    expect(inLagoonWater(centre.x, centre.z)).toBe(true);
    expect(onLagoonDeck(centre.x, centre.z)).toBe(false);
    const deckPoint = onDeckRing(200, 0.5);
    expect(onLagoonDeck(SITE.lagoon.x + deckPoint.x, SITE.lagoon.z + deckPoint.z)).toBe(true);
    const outside = onDeckRing(0, 1.6);
    expect(insideDeckEllipse(SITE.lagoon.x + outside.x, SITE.lagoon.z + outside.z)).toBe(false);
  });

  it("measures bearing distance the short way round", () => {
    expect(angleDistance(350, 10)).toBeCloseTo(20, 6);
    expect(angleDistance(270, 90)).toBeCloseTo(180, 6);
  });
});

describe("lagoon layout", () => {
  const layout = lagoonLayout({ lowQuality: false });

  it("builds a full scene of parts", () => {
    expect(layout.parts.length).toBeGreaterThan(100);
    expect(layout.counts.furniture).toBeGreaterThan(40);
    expect(layout.counts.planting).toBeGreaterThan(10);
    expect(layout.counts.lights).toBeGreaterThan(6);
    expect(new Set(layout.parts.map((part) => part.id)).size).toBe(layout.parts.length);
  });

  it("keeps furniture and lighting out of the water", () => {
    for (const part of layout.parts) {
      if (part.group !== "furniture" && part.group !== "light") continue;
      if (part.id.startsWith("lagoon/steps/")) continue;
      const bounds = world(part);
      expect(inLagoonWater((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, 0.995), part.id).toBe(false);
    }
  });

  it("keeps every part on the paving, except the reeds and lilies", () => {
    for (const part of layout.parts) {
      if (part.id.startsWith("lagoon/reed/") || part.id.startsWith("lagoon/lily/") || part.id.startsWith("lagoon/steps/")) continue;
      const bounds = world(part);
      for (const [x, z] of [
        [bounds.minX, bounds.minZ],
        [bounds.maxX, bounds.minZ],
        [bounds.minX, bounds.maxZ],
        [bounds.maxX, bounds.maxZ],
      ] as const) {
        expect(insideDeckEllipse(x, z), `${part.id} corner ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      }
    }
  });

  it("plants the reeds and lilies in the water, not on the coping", () => {
    for (const part of layout.parts) {
      if (!part.id.startsWith("lagoon/reed/") && !part.id.startsWith("lagoon/lily/")) continue;
      const bounds = world(part);
      expect(inLagoonWater((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, 0.99), part.id).toBe(true);
    }
  });

  it("keeps the pavilion clear of the water and on the deck", () => {
    const pavilion = layout.parts.filter((part) => part.id.startsWith("lagoon/pavilion/"));
    expect(pavilion.length).toBeGreaterThan(10);
    for (const part of pavilion) {
      const bounds = world(part);
      expect(inLagoonWater(bounds.minX, bounds.minZ, 0.99)).toBe(false);
      expect(inLagoonWater(bounds.maxX, bounds.maxZ, 0.99)).toBe(false);
      expect(insideDeckEllipse((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2), part.id).toBe(true);
    }
  });

  it("drops detail in performance mode instead of dropping the feature", () => {
    const low = lagoonLayout({ lowQuality: true });
    expect(low.parts.length).toBeLessThan(layout.parts.length);
    expect(low.counts.furniture).toBeGreaterThan(10);
    expect(low.parts.some((part) => part.id.startsWith("lagoon/pavilion/"))).toBe(true);
  });
});

describe("lagoon validation", () => {
  it("passes the shipped lagoon", () => {
    const report = validateScene({ entries });
    expect(report.findings.filter((finding) => finding.subject === "lagoon")).toEqual([]);
    expect(report.checked.lagoonParts).toBeGreaterThan(100);
    expect(report.checked.lagoonDrawCalls).toBeLessThan(16);
  });

  it("flags a lounger floating in the water", () => {
    const report = validateScene({
      entries,
      vegetation: false,
      lagoon: ({ lowQuality }) => {
        const layout = lagoonLayout({ lowQuality });
        return {
          ...layout,
          parts: [
            ...layout.parts,
            {
              id: "lagoon/test/lounger-in-water",
              group: "furniture",
              material: "timber",
              shape: { kind: "box", size: [0.7, 0.1, 1.9], position: [0, 0.4, 0] },
            },
          ],
        };
      },
    });
    const hit = report.findings.find((finding) => finding.objectId === "lagoon/test/lounger-in-water");
    expect(hit?.severity).toBe("high");
    expect(hit?.message).toContain("stands in the water");
  });

  it("flags a structure built over the water", () => {
    const report = validateScene({
      entries,
      vegetation: false,
      lagoon: ({ lowQuality }) => {
        const layout = lagoonLayout({ lowQuality });
        return {
          ...layout,
          parts: [
            ...layout.parts,
            {
              id: "lagoon/test/jetty",
              group: "structure",
              material: "deck",
              shape: { kind: "box", size: [3, 0.2, 3], position: [0, 0.3, 0] },
            },
          ],
        };
      },
    });
    const hit = report.findings.find((finding) => finding.objectId === "lagoon/test/jetty");
    expect(hit?.severity).toBe("high");
    expect(hit?.message).toContain("built over the water");
  });

  it("flags a bollard pushed off the paving", () => {
    const report = validateScene({
      entries,
      vegetation: false,
      lagoon: ({ lowQuality }) => {
        const layout = lagoonLayout({ lowQuality });
        const far = onDeckRing(0, 1.4);
        return {
          ...layout,
          parts: [
            ...layout.parts,
            {
              id: "lagoon/test/bollard-off-deck",
              group: "light",
              material: "metal",
              shape: { kind: "cylinder", size: [0.06, 0.08, 0.9], position: [far.x, 0.45, far.z] },
            },
          ],
        };
      },
    });
    const hit = report.findings.find((finding) => finding.objectId === "lagoon/test/bollard-off-deck");
    expect(hit?.severity).toBe("medium");
    expect(hit?.message).toContain("overhangs the outer deck edge");
  });
});

describe("lagoon geometry", () => {
  it("merges into a handful of meshes with sane bounds", () => {
    disposeLagoonGeometries();
    const { layout, geometries } = buildLagoonGeometries({ lowQuality: false });
    const materials = new Set(layout.parts.map((part) => part.material));
    expect(Object.keys(geometries).length).toBeGreaterThan(5);
    expect(Object.keys(geometries).length).toBeLessThanOrEqual(materials.size);
    for (const [material, geometry] of Object.entries(geometries)) {
      const box = geometry!.boundingBox;
      expect(box, `${material} has no bounds`).not.toBeNull();
      expect(box!.isEmpty()).toBe(false);
      // The deck ellipse is 2 x (rx + deck) by 2 x (rz + deck) = 42 x 30.4 m; the
      // merged meshes must stay inside it, plus the coping's own thickness.
      expect(box!.max.x - box!.min.x).toBeLessThan(43);
      expect(box!.max.z - box!.min.z).toBeLessThan(32);
      expect(box!.max.y).toBeLessThan(5);
    }
    const stats = lagoonGeometryStats();
    expect(stats.variants).toBe(1);
    expect(stats.drawCalls).toBeLessThan(16);
    expect(stats.triangles).toBeGreaterThan(0);
  });

  it("caches both quality variants", () => {
    disposeLagoonGeometries();
    buildLagoonGeometries({ lowQuality: false });
    buildLagoonGeometries({ lowQuality: true });
    buildLagoonGeometries({ lowQuality: true });
    expect(lagoonGeometryStats().variants).toBe(2);
  });
});
