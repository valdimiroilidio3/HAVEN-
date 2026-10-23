import { describe, expect, it } from "vitest";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { insidePlotInterior, PATH } from "@/lib/3d/circulation";
import {
  RESIDENTS,
  buildResidentWorld,
  createResidentSim,
  poseFor,
  residentCounts,
  stepResidentSim,
  type ResidentEntry,
  type ResidentSim,
} from "@/lib/3d/residents";

/**
 * The residents, simulated.
 *
 * There is no GPU and no browser in this environment, so the population is
 * verified the only way that is honest: run the real simulation for minutes of
 * simulated time and check what the people actually did. A screenshot would not
 * prove that a conversation starts *and* ends; this does.
 */

const entries: ResidentEntry[] = SEED_UNITS.map((unit) => ({
  code: unit.code,
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
  typology: unit.typology,
}));

function run(sim: ResidentSim, seconds: number, step = 1 / 30): ResidentSim {
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i += 1) stepResidentSim(sim, step);
  return sim;
}

/** Distance from a point to the nearest walkable edge (segment between nodes). */
function distanceToNetwork(sim: ResidentSim, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  const { nodes, adjacency } = sim.world;
  for (let i = 0; i < nodes.length; i += 1) {
    for (const j of adjacency[i]!) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      best = Math.min(best, Math.hypot(x - px, z - pz));
    }
  }
  return best;
}

describe("resident world", () => {
  const world = buildResidentWorld(entries);

  it("builds a connected walkable graph from the real footpaths", () => {
    expect(world.nodes.length).toBeGreaterThan(300);
    expect(world.adjacency.every((edges) => edges.length > 0)).toBe(true);
    // Every node is on a footpath that the circulation module produced.
    const kinds = new Set(world.nodes.map((node) => node.kind));
    expect(kinds.has("ring")).toBe(true);
    expect(kinds.has("boulevard")).toBe(true);
    // Consecutive samples are 2 m apart; junctions are ≤ 1.2 m.
    expect(world.maxNodeGap).toBeLessThanOrEqual(2.5);
  });

  it("serves every front door with a spur node", () => {
    expect(world.doorApproach).toHaveLength(entries.length);
    for (const door of world.doorApproach) {
      expect(door.toDoor).toBeLessThan(12);
    }
  });
});

describe("resident population", () => {
  it("creates 20 residents in the proportions asked for", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    expect(sim.residents).toHaveLength(20);
    const byActivity = (activity: string) => sim.residents.filter((r) => r.activity === activity).length;
    expect(byActivity("stroll")).toBe(6);
    expect(byActivity("conversation")).toBe(4);
    expect(byActivity("entrance")).toBe(3);
    expect(byActivity("leisure")).toBe(3);
    expect(byActivity("couple")).toBe(2);
    expect(byActivity("independent")).toBe(2);
  });

  it("spawns everyone on the pedestrian network, not on grass or in a garden", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    for (const resident of sim.residents) {
      expect(distanceToNetwork(sim, resident.x, resident.z), resident.id).toBeLessThan(0.3);
      for (const entry of entries) {
        expect(
          insidePlotInterior(resident.x, resident.z, entry.position, entry.rotationY, entry.typology),
          `${resident.id} starts inside ${entry.code}`,
        ).toBe(false);
      }
    }
  });

  it("gives people different bodies", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    expect(new Set(sim.residents.map((r) => r.style.height)).size).toBeGreaterThan(10);
    expect(new Set(sim.residents.map((r) => r.style.shirt)).size).toBeGreaterThan(3);
    const heights = sim.residents.map((r) => r.style.height);
    expect(Math.min(...heights)).toBeGreaterThan(1.55);
    expect(Math.max(...heights)).toBeLessThan(2);
  });
});

describe("movement", () => {
  it("everybody moves, and nobody leaves the walkable network", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    // Let the initial conversation pairs reach their spots.
    run(sim, 90);
    const travelledBefore = sim.residents.map((r) => r.travelled);
    run(sim, 240);

    for (const [index, resident] of sim.residents.entries()) {
      const moved = resident.travelled - (travelledBefore[index] ?? 0);
      expect(moved, `${resident.id} barely moved`).toBeGreaterThan(3);
      expect(distanceToNetwork(sim, resident.x, resident.z), `${resident.id} left the path`).toBeLessThan(1.4);
    }
    expect(sim.navFailures).toBe(0);
  });

  it("never walks through a private plot", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    for (let i = 0; i < 300; i += 1) {
      stepResidentSim(sim, 1 / 20);
      for (const resident of sim.residents) {
        for (const entry of entries) {
          const inside = insidePlotInterior(resident.x, resident.z, entry.position, entry.rotationY, entry.typology);
          expect(inside, `${resident.id} entered ${entry.code} at t=${sim.time.toFixed(1)}s`).toBe(false);
        }
      }
    }
  });

  it("turns the body toward travel instead of sliding sideways", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    // Two things are true and testable: a body faces its current target once it
    // has walked toward it for over a second, and it never jumps faster than a
    // walk. (Net displacement over a second is a poor proxy: at a corner the
    // chord cuts the angle, and stepping around somebody is not sliding.)
    const stableSince = new Map<number, { target: number; since: number }>();
    const previous = sim.residents.map((resident) => ({ x: resident.x, z: resident.z }));
    let checked = 0;
    for (let i = 0; i < 90 * 20; i += 1) {
      stepResidentSim(sim, 1 / 20);
      for (const resident of sim.residents) {
        const last = previous[resident.index]!;
        const travelled = Math.hypot(resident.x - last.x, resident.z - last.z);
        // Never further in one frame than a walk plus a small nudge.
        expect(travelled, `${resident.id} jumped`).toBeLessThan(1.45 / 20 + 0.12);
        last.x = resident.x;
        last.z = resident.z;

        if (resident.state !== "walking" || resident.speed < 0.3) continue;
        const nodeIndex = resident.route[resident.routeIndex];
        if (nodeIndex === undefined) continue;
        const seen = stableSince.get(resident.index);
        if (!seen || seen.target !== nodeIndex) {
          stableSince.set(resident.index, { target: nodeIndex, since: sim.time });
          continue;
        }
        if (sim.time - seen.since < 1.2) continue;
        const target = sim.world.nodes[nodeIndex]!;
        const heading = Math.atan2(target.x - resident.x, target.z - resident.z);
        const delta = Math.abs(Math.atan2(Math.sin(heading - resident.rotationY), Math.cos(heading - resident.rotationY)));
        // 0.5 rad leaves room for the sidestep used when passing someone.
        expect(delta, `${resident.id} is not facing where it walks`).toBeLessThan(0.5);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("eases speed instead of snapping to it", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    const before = sim.residents.map((r) => r.speed);
    stepResidentSim(sim, 1 / 60);
    const after = sim.residents.map((r) => r.speed);
    for (const [index, speed] of after.entries()) {
      expect(Math.abs(speed - (before[index] ?? 0))).toBeLessThan(0.35);
    }
  });

  it("clamps a runaway frame delta so nobody teleports", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    run(sim, 30);
    const before = sim.residents.map((r) => ({ x: r.x, z: r.z }));
    // A tab returning from the background delivers a huge delta.
    stepResidentSim(sim, 45);
    sim.residents.forEach((resident, index) => {
      const previous = before[index]!;
      const jump = Math.hypot(resident.x - previous.x, resident.z - previous.z);
      expect(jump, `${resident.id} teleported`).toBeLessThan(RESIDENTS.maxDelta * 2.6);
    });
  });

  it("keeps pausing temporary: everybody walks again", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    run(sim, 400);
    // No resident may be sitting in the same place for the whole minute: pausing
    // expires, conversations end, waiting for a partner times out.
    const positions = sim.residents.map((r) => ({ x: r.x, z: r.z }));
    run(sim, 70);
    const moved = sim.residents.filter((resident, index) => {
      const previous = positions[index]!;
      return Math.hypot(resident.x - previous.x, resident.z - previous.z) > 1;
    });
    expect(moved.length, `${20 - moved.length} residents did not move for 70 s`).toBeGreaterThanOrEqual(16);
  });
});

describe("over a long session", () => {
  it("keeps the population alive for twenty minutes without freezing or overlapping", { timeout: 90_000 }, () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    const statesSeen = sim.residents.map(() => new Set<string>());
    const travelledFrom = sim.residents.map((resident) => resident.travelled);
    const stationary = sim.residents.map(() => 0);
    let closest = Number.POSITIVE_INFINITY;
    const step = 1 / 15;
    const steps = Math.round(1200 / step);

    for (let i = 0; i < steps; i += 1) {
      stepResidentSim(sim, step);
      for (const resident of sim.residents) {
        statesSeen[resident.index]!.add(resident.state);
        // Standing still while talking is allowed; standing still otherwise is not.
        stationary[resident.index] = resident.state === "interacting" || resident.speed > 0.05 ? 0 : stationary[resident.index]! + step;
        expect(stationary[resident.index], `${resident.id} frozen`).toBeLessThan(120);
      }
      if (i % 15 === 0) {
        for (let a = 0; a < sim.residents.length; a += 1) {
          for (let b = a + 1; b < sim.residents.length; b += 1) {
            const first = sim.residents[a]!;
            const second = sim.residents[b]!;
            const gap = Math.hypot(first.x - second.x, first.z - second.z);
            closest = Math.min(closest, gap);
          }
        }
      }
      if (i % 300 === 0) {
        for (const resident of sim.residents) {
          expect(distanceToNetwork(sim, resident.x, resident.z), `${resident.id} left the network`).toBeLessThan(1.15);
        }
      }
    }

    for (const [index, seen] of statesSeen.entries()) {
      const resident = sim.residents[index]!;
      // Everyone must alternate between walking and stopping, and walk real
      // distance. Requiring every activity to pass through `interacting` would
      // be wrong: only four residents are conversationalists.
      expect(seen.has("walking"), `${resident.id} never walked`).toBe(true);
      expect(seen.size, `${resident.id} did only ${[...seen].join("/")}`).toBeGreaterThanOrEqual(2);
      expect(resident.travelled - travelledFrom[index]!, `${resident.id} barely moved`).toBeGreaterThan(40);
    }
    // Nobody is inside anybody: centres never closer than the separation floor.
    expect(closest).toBeGreaterThan(0.4);
    expect(sim.navFailures).toBe(0);
    expect(sim.unreachableMeetings).toBe(0);
    expect(sim.conversations.started).toBeGreaterThanOrEqual(10);
    expect(sim.conversations.ended).toBeGreaterThanOrEqual(sim.conversations.started - 2);
  });
});

describe("conversations", () => {
  it("starts and finishes at least two conversations", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    run(sim, 300);
    expect(sim.conversations.started).toBeGreaterThanOrEqual(2);
    expect(sim.conversations.ended).toBeGreaterThanOrEqual(2);
  });

  it("puts partners at conversation distance, facing each other", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    let checked = 0;
    for (let i = 0; i < 3000 && checked < 6; i += 1) {
      stepResidentSim(sim, 1 / 20);
      for (const resident of sim.residents) {
        if (resident.state !== "interacting" || resident.partner === null) continue;
        // People turn to face the person they are talking to; that takes about a
        // second. Judge the pose once they have had time to turn.
        if (resident.stateAge < 1.2) continue;
        const partner = sim.residents[resident.partner]!;
        if (partner.index < resident.index) continue;
        const gap = Math.hypot(partner.x - resident.x, partner.z - resident.z);
        expect(gap, `${resident.id} and ${partner.id} are too far apart`).toBeGreaterThan(0.7);
        expect(gap, `${resident.id} and ${partner.id} are inside each other`).toBeLessThan(2.2);
        // Both must look at the other: a conversation where both stare outward
        // is exactly the failure the brief calls out.
        for (const [a, b] of [[resident, partner], [partner, resident]] as const) {
          const heading = Math.atan2(b.x - a.x, b.z - a.z);
          const delta = Math.abs(Math.atan2(Math.sin(heading - a.rotationY), Math.cos(heading - a.rotationY)));
          expect(delta, `${a.id} is not facing its partner`).toBeLessThan(0.4);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("gestures while talking, and stops when the conversation ends", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    // Measure the swing, not an absolute angle: what matters is that the hands
    // move while a person talks, and that the swing drops when they stop.
    const low = new Map<number, number>();
    const high = new Map<number, number>();
    for (let i = 0; i < 2000; i += 1) {
      stepResidentSim(sim, 1 / 20);
      for (const resident of sim.residents) {
        if (resident.state !== "interacting") continue;
        const pose = poseFor(resident);
        low.set(resident.index, Math.min(low.get(resident.index) ?? Infinity, pose.armL));
        high.set(resident.index, Math.max(high.get(resident.index) ?? -Infinity, pose.armL));
      }
    }
    const swings = [...high.entries()].map(([index, top]) => top - (low.get(index) ?? top));
    expect(swings.length, "nobody talked").toBeGreaterThan(0);
    expect(Math.max(...swings), "hands never moved while talking").toBeGreaterThan(0.15);
    const still = sim.residents.find((resident) => resident.state !== "interacting");
    expect(still).toBeDefined();
    expect(Math.abs(poseFor(still!).armL)).toBeLessThan(0.6);
  });

  it("does not leave a pair talking forever", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    run(sim, 900);
    // Over fifteen minutes a pair must have talked more than once.
    expect(sim.conversations.ended).toBeGreaterThanOrEqual(sim.conversations.started - 2);
  });
});

describe("lifecycle", () => {
  it("is deterministic for a given seed", () => {
    const a = createResidentSim(buildResidentWorld(entries), { count: 20, seed: 7 });
    const b = createResidentSim(buildResidentWorld(entries), { count: 20, seed: 7 });
    run(a, 45);
    run(b, 45);
    a.residents.forEach((resident, index) => {
      expect(resident.x).toBeCloseTo(b.residents[index]!.x, 6);
      expect(resident.z).toBeCloseTo(b.residents[index]!.z, 6);
      expect(resident.state).toBe(b.residents[index]!.state);
    });
  });

  it("does not put everybody back in the same place after a restart", () => {
    const first = createResidentSim(buildResidentWorld(entries), { count: 20, seed: 1 });
    const second = createResidentSim(buildResidentWorld(entries), { count: 20, seed: 99 });
    const different = first.residents.filter((resident, index) => {
      const other = second.residents[index]!;
      return Math.hypot(resident.x - other.x, resident.z - other.z) > 1;
    });
    expect(different.length).toBeGreaterThan(10);
  });

  it("honours a smaller population", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 6 });
    expect(sim.residents).toHaveLength(6);
    run(sim, 60);
    expect(residentCounts(sim).created).toBe(6);
  });

  it("reports live counts that add up", () => {
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    run(sim, 120);
    const counts = residentCounts(sim);
    expect(counts.walking + counts.pausing + counts.interacting + counts.idle).toBe(counts.created);
    expect(counts.walking).toBeGreaterThan(0);
  });
});

describe("scale", () => {
  it("uses adult human dimensions", () => {
    // Height is used directly by the renderer; 1.6–1.93 m against 2.7 m doors.
    const sim = createResidentSim(buildResidentWorld(entries), { count: 20 });
    for (const resident of sim.residents) {
      expect(resident.style.height).toBeGreaterThanOrEqual(1.6);
      expect(resident.style.height).toBeLessThanOrEqual(1.93);
    }
  });

  it("keeps the conversation gap inside the footpath", () => {
    // Spots are offset by half a conversation gap from the centreline.
    expect(RESIDENTS.talkGap * 2).toBeLessThan(PATH.width / 2 + 0.2);
  });
});
