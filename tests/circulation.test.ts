import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { getFloorPlan } from "@/lib/domain/floorplans";
import { SITE, footprintExtents, pointOnRoad } from "@/lib/3d/site";
import {
  PATH,
  circulation,
  footpaths,
  insidePlotInterior,
  onCarriageway,
  pathPoints,
  type Footpath,
} from "@/lib/3d/circulation";
import { validateScene, type SceneEntryInput } from "@/lib/3d/validate";

const entries = SEED_UNITS.map((unit) => ({
  code: unit.code,
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
  typology: unit.typology,
}));

const sceneEntries: SceneEntryInput[] = SEED_UNITS.map((unit) => ({
  property: { code: unit.code, typology: unit.typology },
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
}));

describe("pedestrian network", () => {
  const report = circulation(entries);

  it("reaches every front door from the gate", () => {
    expect(report.unreachable).toEqual([]);
    expect(report.walks).toHaveLength(entries.length);
    for (const walk of report.walks) expect(walk.metres).not.toBeNull();
  });

  it("keeps the worst walk plausible for a 174 × 146 m site", () => {
    // The far corner is ~140 m as the crow flies; walking the circuit must not
    // exceed twice that, or the network is forcing a pointless detour.
    expect(report.worstWalk).toBeGreaterThan(40);
    expect(report.worstWalk).toBeLessThan(300);
  });

  it("closes both rings", () => {
    for (const path of report.paths.filter((candidate) => candidate.kind === "ring" && !candidate.id.includes(":"))) {
      const first = path.points[0]!;
      const last = path.points[path.points.length - 1]!;
      expect(Math.hypot(last.x - first.x, last.z - first.z)).toBeLessThan(1e-6);
    }
  });

  it("never runs along a carriageway outside a marked crossing", () => {
    for (const path of report.paths) {
      if (path.kind === "crossing") continue;
      // Only the shared boundary samples of a split path may touch tarmac.
      expect(onCarriageway(path)).toBe(false);
    }
  });

  it("joins the two sides of the network: no asymmetry between east and west", () => {
    // A previous version connected the west boulevard verge and silently failed
    // on the east one, sending half the site the long way round. Compare like
    // with like: mirrored houses must be within a few metres of each other.
    const walkFor = (code: string) => report.walks.find((walk) => walk.code === code)?.metres ?? Infinity;
    for (const [west, east] of [
      ["H05", "H06"],
      ["H07", "H08"],
    ] as const) {
      expect(Math.abs(walkFor(west) - walkFor(east))).toBeLessThan(40);
    }
  });

  it("keeps every path clear of the houses", () => {
    for (const point of pathPoints(report.paths)) {
      for (const entry of entries) {
        const { hx, hz } = footprintExtents(entry.typology, entry.rotationY);
        const inside =
          point.x > entry.position.x - hx &&
          point.x < entry.position.x + hx &&
          point.z > entry.position.z - hz &&
          point.z < entry.position.z + hz;
        expect(inside, `${point.id} is inside ${entry.code}`).toBe(false);
      }
    }
  });

  it("only lets a spur enter a private plot, and keeps it short", () => {
    // One conflict is known and reported by the validator: at the north-west
    // corner H13's plot leaves only 1.85 m between its wall and the kerb, which
    // is narrower than the footpath. Fixing it moves approved architecture, so
    // it is pinned here rather than silently tolerated.
    const clashes = new Set<string>();
    for (const path of report.paths) {
      if (path.kind === "spur" || path.kind === "crossing") continue;
      for (const point of path.points) {
        for (const entry of entries) {
          if (insidePlotInterior(point.x, point.z, entry.position, entry.rotationY, entry.typology)) {
            clashes.add(`${path.id.split("#")[0]}|${entry.code}`);
          }
        }
      }
    }
    expect([...clashes]).toEqual(["path/ring-outer:walk:2|H13"]);
    for (const spur of report.paths.filter((path) => path.kind === "spur")) {
      const first = spur.points[0]!;
      const last = spur.points[spur.points.length - 1]!;
      expect(Math.hypot(last.x - first.x, last.z - first.z)).toBeLessThan(14);
    }
  });

  it("gives every path a walkable width", () => {
    for (const path of report.paths) {
      const minimum = path.kind === "crossing" ? 2 : 1.2;
      expect(path.width, path.id).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("samples the network at a density a plan can be drawn from", () => {
    expect(report.paths.length).toBeGreaterThan(10);
    expect(report.graph.nodes.length).toBeGreaterThan(200);
    expect(report.graph.edges.length).toBeGreaterThan(report.graph.nodes.length - 1);
  });

  it("puts a spur on the façade side of every house", () => {
    for (const entry of entries) {
      const spur = report.paths.find((path) => path.id === `path/spur/${entry.code}`);
      expect(spur, entry.code).toBeDefined();
      const rad = (entry.rotationY * Math.PI) / 180;
      const facing = { x: Math.sin(rad), z: Math.cos(rad) };
      const door = report.entrances.find((candidate) => candidate.code === entry.code)!.point;
      const end = spur!.points[spur!.points.length - 1]!;
      const forward = (end.x - door.x) * facing.x + (end.z - door.z) * facing.z;
      // The network is in front of the door, never behind the house.
      expect(forward).toBeGreaterThan(0);
    }
  });
});

describe("circulation rules fire on broken networks", () => {
  const healthy = footpaths(entries);

  it("reports an unreachable house when its spur is removed", () => {
    const severed = healthy.filter((path) => path.id !== "path/spur/H01");
    const report = validateScene({ entries: sceneEntries, network: () => severed });
    const finding = report.findings.find((candidate) => candidate.objectId === "H01/entrance");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("critical");
    expect(finding?.category).toBe("circulation");
    expect(report.ok).toBe(false);
  });

  it("reports a path that cuts through a house", () => {
    const house = entries[0]!;
    const { hx, hz } = footprintExtents(house.typology, house.rotationY);
    const breakIn: Footpath = {
      id: "path/test/through-house",
      kind: "spur",
      width: 2,
      points: [
        { x: house.position.x - hx - 2, z: house.position.z },
        { x: house.position.x, z: house.position.z },
        { x: house.position.x + hx + 2, z: house.position.z },
      ],
    };
    const report = validateScene({ entries: sceneEntries, network: () => [...healthy, breakIn] });
    const finding = report.findings.find((candidate) => candidate.objectId.startsWith("path/test/through-house#1"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("critical");
    void hz;
  });

  it("reports a path that runs along the carriageway", () => {
    // Straight down the ring: the classic mistake of drawing a walk *on* the road.
    const onRoad: Footpath = {
      id: "path/test/on-road",
      kind: "boulevard",
      width: 2,
      points: [
        { x: SITE.ring.outer.maxX - 1, z: -20 },
        { x: SITE.ring.outer.maxX - 1, z: 0 },
        { x: SITE.ring.outer.maxX - 1, z: 20 },
      ],
    };
    expect(onCarriageway(onRoad)).toBe(true);
    const report = validateScene({ entries: sceneEntries, network: () => [...healthy, onRoad] });
    const finding = report.findings.find((candidate) => candidate.objectId === "path/test/on-road" && candidate.category === "circulation");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
  });

  it("reports a path that is too narrow to walk", () => {
    const narrow: Footpath = {
      id: "path/test/narrow",
      kind: "ring",
      width: 0.9,
      points: [
        { x: -20, z: 10 },
        { x: -18, z: 10 },
      ],
    };
    const report = validateScene({ entries: sceneEntries, network: () => [...healthy, narrow] });
    const finding = report.findings.find((candidate) => candidate.objectId === "path/test/narrow");
    expect(finding?.severity).toBe("medium");
  });

  it("reports a public path cutting across a private plot", () => {
    const plot = entries[3]!; // H04, a south-side house
    const rear = SITE.ring.outer.maxZ;
    const crossing: Footpath = {
      id: "path/test/across-plot",
      kind: "ring",
      width: 2,
      points: [
        { x: plot.position.x - 12, z: plot.position.z + 6 },
        { x: plot.position.x, z: plot.position.z + 6 },
        { x: plot.position.x + 12, z: plot.position.z + 6 },
      ],
    };
    const report = validateScene({ entries: sceneEntries, network: () => [...healthy, crossing] });
    const finding = report.findings.find((candidate) => candidate.objectId === "path/test/across-plot");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("medium");
    // The rule names whichever plot the path actually crosses.
    const hit = entries.find((candidate) => candidate.code === finding?.subject)!;
    expect(hit).toBeDefined();
    const inside = crossing.points.some((point) =>
      insidePlotInterior(point.x, point.z, hit.position, hit.rotationY, hit.typology),
    );
    expect(inside).toBe(true);
    void rear;
  });

  it("counts the network in the report", () => {
    const report = validateScene({ entries: sceneEntries });
    expect(report.checked.footpaths).toBeGreaterThan(10);
    expect(report.checked.pathNodes).toBeGreaterThan(200);
    expect(report.checked.worstWalk).not.toBeNull();
    expect(report.checked.worstWalk!).toBeLessThan(300);
  });
});

describe("path geometry", () => {
  it("keeps the authored widths and clearances coherent", () => {
    expect(PATH.width).toBeGreaterThanOrEqual(1.2);
    expect(PATH.width).toBeLessThanOrEqual(3);
    expect(PATH.sample).toBeGreaterThan(0.5);
    expect(PATH.joinRadius).toBeGreaterThan(PATH.sample / 2);
    expect(PATH.doorLink).toBeLessThan(PATH.snap);
  });

  it("never puts a sample on the road except where a crossing is intended", () => {
    const report = circulation(entries);
    for (const path of report.paths) {
      if (path.kind === "crossing") continue;
      const interior = path.points.slice(1, -1);
      for (const point of interior) expect(pointOnRoad(point.x, point.z, 0.6)).toBe(false);
    }
  });

  it("uses the plan depth to place the door, not a constant", () => {
    for (const entry of entries) {
      const plan = getFloorPlan(entry.typology);
      const rad = (entry.rotationY * Math.PI) / 180;
      const facing = { x: Math.sin(rad), z: Math.cos(rad) };
      const door = circulation([entry]).entrances[0]!.point;
      const forward = (door.x - entry.position.x) * facing.x + (door.z - entry.position.z) * facing.z;
      expect(forward).toBeGreaterThan(plan.depthM / 2);
      expect(forward).toBeLessThan(plan.depthM / 2 + 1);
    }
  });
});
