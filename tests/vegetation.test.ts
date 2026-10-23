import { describe, expect, it } from "vitest";
import { buildCanopies, canopyTint, POOL_COLORS } from "@/components/three/vegetation";
import { TREE_KINDS } from "@/lib/3d/site";

describe("tree canopies", () => {
  it("builds layered geometry for every species", () => {
    const canopies = buildCanopies();
    for (const kind of TREE_KINDS) {
      const build = canopies[kind];
      expect(build.geometry.getAttribute("position").count).toBeGreaterThan(60);
      build.geometry.computeBoundingBox();
      const box = build.geometry.boundingBox!;
      expect(Number.isFinite(box.max.x - box.min.x)).toBe(true);
      expect(box.max.x - box.min.x).toBeGreaterThan(0.5);
      expect(build.radius).toBeGreaterThan(0.5);
      build.geometry.dispose();
    }
  });

  it("gives conifers and poplars a taller silhouette than olives", () => {
    const canopies = buildCanopies();
    const box = (kind: keyof typeof canopies) => {
      canopies[kind].geometry.computeBoundingBox();
      return canopies[kind].geometry.boundingBox!;
    };
    const poplar = box("poplar");
    const olive = box("olive");
    expect(poplar.max.y - poplar.min.y).toBeGreaterThan(olive.max.y - olive.min.y);
    for (const kind of TREE_KINDS) canopies[kind].geometry.dispose();
  });

  it("tints deterministically and darkens at night", () => {
    const day = canopyTint("broadleaf", 0.42, false);
    const same = canopyTint("broadleaf", 0.42, false);
    const night = canopyTint("broadleaf", 0.42, true);
    expect(day.getHex()).toBe(same.getHex());
    expect(night.r).toBeLessThan(day.r);
    expect(day.r).toBeGreaterThan(0);
  });

  it("defines distinct day and night water", () => {
    expect(POOL_COLORS.day.water).not.toBe(POOL_COLORS.night.water);
  });
});
