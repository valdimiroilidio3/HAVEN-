import { entranceFor, footpaths, insidePlotInterior, PATH, type PathPoint } from "./circulation";
import type { Typology } from "@/lib/domain/types";

/**
 * The people who live in the condominium.
 *
 * This module is the simulation and nothing else: it owns positions, routes,
 * states and timers, and it imports no three.js and no React. The renderer
 * (`components/three/site/Residents.tsx`) reads it once per frame and writes
 * matrices; it never causes a React render. Keeping it pure is what makes it
 * testable — `tests/residents.test.ts` runs the whole population for minutes of
 * simulated time and checks that people walk, meet, talk and split up.
 *
 * Where they walk
 * ---------------
 * On the pedestrian network that already exists (`lib/3d/circulation.ts`), the
 * same one the site plan draws and the validator checks. No coordinates are
 * invented here: nodes are the sampled footpaths, edges are consecutive samples
 * (2 m) and joins (≤ 1.2 m). A resident therefore cannot walk through a house,
 * a wall, a pool or a carriageway — the network does not go there.
 *
 * What they do
 * ------------
 * `idle → walking → pausing → interacting → walking`, per resident. Speeds are
 * eased, bodies turn toward travel at a bounded rate, and pauses always end.
 * Conversation pairs walk to two spots 1.16 m apart on the same footpath, face
 * each other, gesture, and part again after a variable interval.
 */

export interface ResidentEntry {
  code: string;
  position: PathPoint;
  rotationY: number;
  typology: Typology;
}

export const RESIDENTS = {
  /** Initial demonstration population. */
  defaultCount: 20,
  /** Footpath surface height (the ribbons sit at 0.036 m). */
  groundY: 0.036,
  /** One full stride (two steps) per this many metres. */
  strideMetres: 1.44,
  /** Clamp on frame delta: a backgrounded tab must not teleport anyone. */
  maxDelta: 0.1,
  /** Distance at which a node counts as reached. */
  arrive: 0.42,
  /** Accel / decel, m/s². */
  accel: 1.7,
  decel: 2.9,
  /** Turning rate, rad/s. */
  turnRate: 3.4,
  /** Personal space used for the standoff between two walkers. */
  personalSpace: 0.62,
  /** Two bodies may never be closer than this, centres. */
  minSeparation: 0.46,
  /** Half the gap between two people in conversation. */
  talkGap: 0.58,
  conversation: { min: 9, max: 24, /** Give up waiting for a partner after this. */ rendezvous: 60 },
  /** A pause is never permanent. */
  pause: { min: 2.5, max: 9 },
} as const;

export type ResidentState = "idle" | "walking" | "pausing" | "interacting";

export type ResidentActivity =
  | "stroll"
  | "couple"
  | "conversation"
  | "entrance"
  | "leisure"
  | "independent";

export interface ResidentStyle {
  /** Total standing height, metres. Adults only: 1.60–1.93. */
  height: number;
  /** Shoulder width multiplier. */
  build: number;
  skin: number;
  hair: number;
  shirt: number;
  trousers: number;
  /** Gait amplitude: how far this person swings arms and legs. */
  gait: number;
  /** 0 = short, 1 = long, 2 = bald. Geometry only. */
  hairStyle: number;
}

export interface Resident {
  id: string;
  index: number;
  activity: ResidentActivity;
  style: ResidentStyle;
  x: number;
  z: number;
  /** Facing, radians: 0 looks toward +Z. */
  rotationY: number;
  /** Current speed, m/s. */
  speed: number;
  /** Preferred speed for this person. */
  cruise: number;
  state: ResidentState;
  /** Seconds left in pausing/interacting. */
  timer: number;
  /** Node indices still to visit. */
  route: number[];
  routeIndex: number;
  /** Final point of the route, when it is not a node (conversation spot). */
  spot: { x: number; z: number } | null;
  /** The node the current rendezvous is aimed at, for re-routing. */
  meetingNode: number | null;
  /**
   * Connected component this resident walks. Near the break in the outer walk,
   * two nodes can be metres apart and still not be connected, so proximity alone
   * does not tell you which side of the seam someone is on.
   */
  homeComponent: number;
  /** Conversation partner, by index. Fixed pairing, kept between meetings. */
  buddy: number | null;
  /** Partner for the conversation in progress, by index. */
  partner: number | null;
  /** True when the next walk should end in a rendezvous with `buddy`. */
  needsRendezvous: boolean;
  /** True once a conversation member reached their spot and is waiting. */
  waiting: boolean;
  /** Animation phase: advances with distance walked, or with time when still. */
  stride: number;
  gesture: number;
  /** Metres walked, used by the debug panel and by the tests. */
  travelled: number;
  /** Seconds spent in the current state. */
  stateAge: number;
  /** Seconds since the last progress check. */
  stuckFor: number;
  /** Where the body was at the last progress check. */
  stuckX: number;
  stuckZ: number;
  /** Node the resident is walking away from (for route continuity). */
  fromNode: number;
  /** Set once the simulation moved them off the network; must stay 0. */
  navFailures: number;
}

export interface WalkNode {
  x: number;
  z: number;
  /** Footpath kind that produced the node. */
  kind: string;
  /** Index of the footpath, to reason about junctions. */
  path: number;
}

export interface ResidentWorld {
  nodes: WalkNode[];
  adjacency: number[][];
  /** Nodes by footpath kind. */
  byKind: Record<string, number[]>;
  /** Nodes on a spur, with the distance to the door they serve. */
  doorApproach: Array<{ code: string; node: number; toDoor: number }>;
  /** Every node is on a footpath; this records the narrowest one it serves. */
  maxNodeGap: number;
  /** Connected component of each node. Meetings only happen inside one. */
  component: number[];
  /** Size of each connected component, one entry per component. */
  componentSizes: number[];
}

export interface ResidentSim {
  world: ResidentWorld;
  residents: Resident[];
  time: number;
  seed: number;
  /** Conversation bookkeeping, surfaced by the debug panel. */
  conversations: { started: number; ended: number };
  /** Meetings cancelled because the two people are on different parts of the network. */
  unreachableMeetings: number;
  /** Times a stuck walker was re-routed. Must stay at zero in normal running. */
  stuckRecoveries: number;
  /** Non-zero means a resident left the walkable network: a real bug. */
  navFailures: number;
}

/* ------------------------------------------------------------------ *
 * Deterministic randomness
 * ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * The walkable network
 * ------------------------------------------------------------------ */

/**
 * Turn the footpath network into a graph of walkable nodes.
 *
 * Node kinds are kept so the population can be distributed by *place* — the ring
 * path, the boulevard, the lagoon deck — rather than by arbitrary coordinates.
 */
/**
 * Spread the spawn points out.
 *
 * Each activity group picks its nodes with a spacing of its own, so two groups
 * could still choose neighbouring nodes and start two people 12 cm apart. A
 * quiet start matters: the first frame the visitor sees should not be two bodies
 * intersecting. Anyone too close moves to the nearest node that is clear, always
 * on the pedestrian network.
 */
function declutterSpawns(world: ResidentWorld, residents: Resident[], minGap: number): void {
  const placed: Array<{ x: number; z: number }> = [];
  for (const resident of residents) {
    const clear = (x: number, z: number) => placed.every((other) => Math.hypot(other.x - x, other.z - z) >= minGap);
    if (clear(resident.x, resident.z)) {
      placed.push({ x: resident.x, z: resident.z });
      continue;
    }
    let best = { node: resident.fromNode, distance: Infinity };
    for (let node = 0; node < world.nodes.length; node += 1) {
      const point = world.nodes[node]!;
      if (!clear(point.x, point.z)) continue;
      const distance = Math.hypot(point.x - resident.x, point.z - resident.z);
      if (distance < best.distance) best = { node, distance };
    }
    const point = world.nodes[best.node]!;
    resident.x = point.x;
    resident.z = point.z;
    resident.fromNode = best.node;
    resident.homeComponent = world.component[best.node] ?? 0;
    placed.push({ x: point.x, z: point.z });
  }
}

export function buildResidentWorld(entries: ResidentEntry[]): ResidentWorld {
  const paths = footpaths(
    entries.map((entry) => ({
      code: entry.code,
      position: entry.position,
      rotationY: entry.rotationY,
      typology: entry.typology,
    })),
  );

  const nodes: WalkNode[] = [];
  const adjacency: number[][] = [];
  const byKind: Record<string, number[]> = {};

  const link = (a: number, b: number) => {
    adjacency[a]!.push(b);
    adjacency[b]!.push(a);
  };

  const inAnyPlot = (x: number, z: number) =>
    entries.some((entry) => insidePlotInterior(x, z, entry.position, entry.rotationY, entry.typology));

  paths.forEach((path, pathIndex) => {
    // The spur to a front door crosses that house's private garden. Residents
    // walk the public network, so spur nodes are not walkable for them: the
    // entrance group stands on the public side of the approach instead.
    if (path.kind === "spur") return;
    let previous = -1;
    for (const point of path.points) {
      if (inAnyPlot(point.x, point.z)) {
        previous = -1;
        continue;
      }
      nodes.push({ x: point.x, z: point.z, kind: path.kind, path: pathIndex });
      const index = nodes.length - 1;
      adjacency.push([]);
      (byKind[path.kind] ??= []).push(index);
      if (previous >= 0) link(previous, index);
      previous = index;
    }
  });

  // Separate polylines share no nodes, so junctions have to be joined explicitly
  // — the same rule the circulation graph uses (PATH.joinRadius).
  const cell = (value: number) => Math.round(value / PATH.joinRadius);
  const grid = new Map<string, number[]>();
  nodes.forEach((node, index) => {
    const key = `${cell(node.x)}:${cell(node.z)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(index);
  });
  nodes.forEach((node, index) => {
    const cx = cell(node.x);
    const cz = cell(node.z);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (const other of grid.get(`${cx + dx}:${cz + dz}`) ?? []) {
          if (other <= index) continue;
          const gap = Math.hypot(nodes[other]!.x - node.x, nodes[other]!.z - node.z);
          if (gap <= PATH.joinRadius && !adjacency[index]!.includes(other)) link(index, other);
        }
      }
    }
  });

  // The approach to each front door: the nearest public walk node beyond the
  // plot boundary. Standing in someone's threshold would be trespass.
  const doorApproach: ResidentWorld["doorApproach"] = [];
  for (const entry of entries) {
    const { entrance } = entranceFor(entry.code, entry.position, entry.rotationY, entry.typology);
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    nodes.forEach((node, index) => {
      const distance = Math.hypot(node.x - entrance.point.x, node.z - entrance.point.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best >= 0) doorApproach.push({ code: entry.code, node: best, toDoor: bestDistance });
  }

  let maxNodeGap = 0;
  nodes.forEach((node, index) => {
    for (const other of adjacency[index]!) {
      maxNodeGap = Math.max(maxNodeGap, Math.hypot(nodes[other]!.x - node.x, nodes[other]!.z - node.z));
    }
  });

  // Connected components: the network is not guaranteed to be one piece — the
  // outer walk is split where it crosses a plot — so pairs must be chosen inside
  // a component, not across it.
  const component = new Array<number>(nodes.length).fill(-1);
  const componentSizes: number[] = [];
  for (let start = 0; start < nodes.length; start += 1) {
    if (component[start] !== -1) continue;
    const id = componentSizes.length;
    const stack = [start];
    component[start] = id;
    let size = 0;
    while (stack.length > 0) {
      const current = stack.pop()!;
      size += 1;
      for (const next of adjacency[current] ?? []) {
        if (component[next] === -1) {
          component[next] = id;
          stack.push(next);
        }
      }
    }
    componentSizes.push(size);
  }

  return { nodes, adjacency, byKind, doorApproach, maxNodeGap, component, componentSizes };
}

/**
 * The world, shared between mounts.
 *
 * `buildResidentWorld` returns a fresh object every call, so a component that
 * rebuilt it on remount also looked like a different world to the session cache
 * and the population was silently recreated. Same entries, same world.
 */
let sharedWorld: { key: string; world: ResidentWorld } | null = null;

export function residentWorldFor(entries: ResidentEntry[]): ResidentWorld {
  const key = entries
    .map((entry) => `${entry.code}|${entry.position.x}|${entry.position.z}|${entry.rotationY}|${entry.typology}`)
    .join(";");
  if (sharedWorld && sharedWorld.key === key) return sharedWorld.world;
  const world = buildResidentWorld(entries);
  sharedWorld = { key, world };
  return world;
}

/** Drops the cached world (tests, and a changed site). */
export function resetResidentWorld(): void {
  sharedWorld = null;
}

/* ------------------------------------------------------------------ *
 * Appearance
 * ------------------------------------------------------------------ */

const SKIN = [0xe8b98f, 0xd9a172, 0xb87a4e, 0x8d5a33, 0x5f3a22];
const HAIR = [0x2b2119, 0x4a3524, 0x7a5a35, 0x1a1a1a, 0x8c8c85];
const SHIRT = [0x2f4858, 0x7f2b2b, 0x2c5545, 0x39404a, 0xa8763e, 0x6a5a72, 0xc8c2b6, 0x314766];
const TROUSERS = [0x2b2f36, 0x3c3a37, 0x1f2933, 0x4a4238, 0x2a3442];

function styleFor(random: () => number): ResidentStyle {
  return {
    height: 1.6 + random() * 0.33,
    build: 0.88 + random() * 0.3,
    skin: SKIN[Math.floor(random() * SKIN.length)]!,
    hair: HAIR[Math.floor(random() * HAIR.length)]!,
    shirt: SHIRT[Math.floor(random() * SHIRT.length)]!,
    trousers: TROUSERS[Math.floor(random() * TROUSERS.length)]!,
    gait: 0.86 + random() * 0.28,
    hairStyle: random() < 0.62 ? 0 : random() < 0.7 ? 1 : 2,
  };
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

function neighbourOf(world: ResidentWorld, node: number, avoid: number, random: () => number): number {
  const options = world.adjacency[node]!.filter((next) => next !== avoid);
  const pool = options.length > 0 ? options : world.adjacency[node]!;
  return pool[Math.floor(random() * pool.length)] ?? node;
}

/** A walk of `length` nodes from `from`, never immediately reversing. */
function routeFrom(world: ResidentWorld, from: number, length: number, random: () => number): number[] {
  const route: number[] = [];
  let current = from;
  let previous = -1;
  for (let i = 0; i < length; i += 1) {
    const next = neighbourOf(world, current, previous, random);
    if (next === current) break;
    route.push(next);
    previous = current;
    current = next;
  }
  return route;
}

/** Evenly spread spawn nodes, at least `spacing` metres apart. */
function pickSpawnNodes(world: ResidentWorld, candidates: number[], count: number, spacing: number, random: () => number): number[] {
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const chosen: number[] = [];
  for (const node of shuffled) {
    if (chosen.length >= count) break;
    const point = world.nodes[node]!;
    const clear = chosen.every((other) => {
      const candidate = world.nodes[other]!;
      return Math.hypot(candidate.x - point.x, candidate.z - point.z) >= spacing;
    });
    if (clear) chosen.push(node);
  }
  // If the network is too small to space them out, fall back to any candidates.
  for (const node of shuffled) {
    if (chosen.length >= count) break;
    if (!chosen.includes(node)) chosen.push(node);
  }
  return chosen.slice(0, count);
}

function nodesOf(world: ResidentWorld, kinds: string[]): number[] {
  const out: number[] = [];
  for (const kind of kinds) out.push(...(world.byKind[kind] ?? []));
  return out;
}

/* ------------------------------------------------------------------ *
 * Creation
 * ------------------------------------------------------------------ */

interface Blueprint {
  activity: ResidentActivity;
  state: ResidentState;
  cruise: number;
  timer: number;
}

/**
 * The initial demonstration population, in the proportions asked for:
 * 6 strolling · 4 in two conversations · 3 by their entrances · 3 at the
 * lagoon/gardens · 2 walking together · 2 independent.
 *
 * The activities are a starting point, not a life sentence: everyone eventually
 * walks, pauses, and those in a pair talk and part.
 */
export function createResidentSim(world: ResidentWorld, options: { count?: number; seed?: number } = {}): ResidentSim {
  const count = Math.max(1, Math.min(120, options.count ?? RESIDENTS.defaultCount));
  const seed = options.seed ?? 20260214;
  const random = mulberry32(seed);

  const blueprints: Blueprint[] = [];
  const push = (activity: ResidentActivity, n: number, cruise: [number, number], state: ResidentState = "walking", timer = 0) => {
    for (let i = 0; i < n && blueprints.length < count; i += 1) {
      blueprints.push({ activity, state, cruise: cruise[0] + random() * (cruise[1] - cruise[0]), timer });
    }
  };
  push("stroll", 6, [1.05, 1.45]);
  push("conversation", 4, [1.0, 1.3]);
  push("entrance", 3, [0.9, 1.2], "pausing", 6 + random() * 14);
  push("leisure", 3, [0.8, 1.05], "pausing", 4 + random() * 10);
  push("couple", 2, [1.0, 1.15]);
  push("independent", 2, [1.1, 1.5]);

  // Any remainder (custom counts) joins the strollers.
  while (blueprints.length < count) push("stroll", 1, [1.0, 1.4]);

  const walkKinds = ["ring", "boulevard", "lagoon", "crossing"];
  const walkNodes = nodesOf(world, walkKinds);
  const leisureNodes = nodesOf(world, ["lagoon", "ring"]);
  const entranceNodes = world.doorApproach.map((entry) => entry.node);

  const strollSpawns = pickSpawnNodes(world, walkNodes, 12, 6, random);
  // Talkers start on a connected walk, so a pair can actually reach its meeting.
  const connectedWalk = walkNodes.filter((node) => world.component[node] === world.componentSizes.indexOf(Math.max(...world.componentSizes)));
  const talkPool = connectedWalk.length >= 4 ? connectedWalk : nodesOf(world, ["ring", "boulevard"]);
  const talkSpawns = pickSpawnNodes(world, talkPool, 4, 8, random);
  const entranceSpawns = pickSpawnNodes(
    world,
    entranceNodes.length > 0 ? entranceNodes : walkNodes,
    3,
    6,
    random,
  );
  const leisureSpawns = pickSpawnNodes(world, leisureNodes.length > 0 ? leisureNodes : walkNodes, 3, 6, random);
  // Pairs must be able to reach each other, so their spawn nodes come from the
  // largest connected component of the network.
  const largest = world.componentSizes.indexOf(Math.max(...world.componentSizes));
  const connectedNodes = walkNodes.filter((node) => world.component[node] === largest);
  const coupleSpawns = pickSpawnNodes(world, connectedNodes.length >= 2 ? connectedNodes : walkNodes, 2, 6, random);
  const independentSpawns = pickSpawnNodes(world, walkNodes, 2, 6, random);

  const take = (list: number[], index: number): number => list[index % Math.max(1, list.length)] ?? 0;

  const residents: Resident[] = blueprints.map((blueprint, index) => {
    const spawn =
      blueprint.activity === "stroll"
        ? take(strollSpawns, index)
        : blueprint.activity === "conversation"
          ? take(talkSpawns, index - 6)
          : blueprint.activity === "entrance"
            ? take(entranceSpawns, index - 10)
            : blueprint.activity === "leisure"
              ? take(leisureSpawns, index - 13)
              : blueprint.activity === "couple"
                ? take(coupleSpawns, index - 16)
                : take(independentSpawns, index - 18);
    const node = world.nodes[spawn] ?? { x: 0, z: 0 };
    return {
      id: `resident-${String(index + 1).padStart(2, "0")}`,
      index,
      activity: blueprint.activity,
      style: styleFor(random),
      x: node.x,
      z: node.z,
      rotationY: random() * Math.PI * 2,
      speed: 0,
      cruise: blueprint.cruise * (0.9 + random() * 0.2),
      state: blueprint.state,
      timer: blueprint.timer,
      route: [],
      routeIndex: 0,
      spot: null,
      meetingNode: null,
      buddy: null,
      partner: null,
      needsRendezvous: false,
      waiting: false,
      stride: random() * Math.PI * 2,
      gesture: random() * Math.PI * 2,
      travelled: 0,
      stateAge: 0,
      stuckFor: 0,
      stuckX: 0,
      stuckZ: 0,
      fromNode: spawn,
      homeComponent: world.component[spawn] ?? 0,
      navFailures: 0,
    };
  });

  // --- conversation pairs ------------------------------------------------
  // The four people whose activity is "conversation" are paired 1–2 and 3–4.
  // Each pair is sent to the same node and takes a spot either side of it, so
  // they arrive facing each other at conversation distance.
  const talkers = residents.filter((resident) => resident.activity === "conversation");
  for (let pair = 0; pair < Math.floor(talkers.length / 2); pair += 1) {
    const a = talkers[pair * 2];
    const b = talkers[pair * 2 + 1];
    if (!a || !b) continue;
    a.buddy = b.index;
    b.buddy = a.index;
    planRendezvous(
      { world, residents, time: 0, seed, conversations: { started: 0, ended: 0 }, unreachableMeetings: 0, stuckRecoveries: 0, navFailures: 0 },
      a,
      b,
      random,
    );
  }

  // --- a quiet start ------------------------------------------------------
  // Nothing may begin inside another body, whatever the seed picked.
  declutterSpawns(world, residents, 1.15);

  // --- companions ---------------------------------------------------------
  // Two people walking together share a route, offset to either side.
  const couple = residents.filter((resident) => resident.activity === "couple");
  if (couple.length === 2) {
    const [a, b] = couple as [Resident, Resident];
    const shared = routeFrom(world, a.fromNode, 8, random);
    a.route = [...shared];
    b.route = [...shared];
    a.routeIndex = 0;
    b.routeIndex = 0;
    // Start them a stride apart along the path, and let their walking speeds
    // differ slightly. Starting both at the same node with the same route left
    // two people permanently inside each other: they moved as one body.
    const start = world.nodes[a.fromNode]!;
    const next = world.nodes[a.route[0] ?? a.fromNode] ?? start;
    const length = Math.hypot(next.x - start.x, next.z - start.z) || 1;
    const ux = (next.x - start.x) / length;
    const uz = (next.z - start.z) / length;
    a.x = start.x;
    a.z = start.z;
    b.x = a.x - ux * 0.85;
    b.z = a.z - uz * 0.85;
    b.rotationY = a.rotationY;
    a.cruise *= 1.04;
    b.cruise *= 0.94;
    b.state = "walking";
    a.state = "walking";
  }

  // --- everyone else gets a route ----------------------------------------
  for (const resident of residents) {
    if (resident.route.length > 0) continue;
    if (resident.state === "pausing") {
      resident.route = [];
      continue;
    }
    resident.route = routeFrom(world, resident.fromNode, 4 + Math.floor(random() * 6), random);
    resident.routeIndex = 0;
  }

  return {
    world,
    residents,
    time: 0,
    seed,
    conversations: { started: 0, ended: 0 },
    unreachableMeetings: 0,
    stuckRecoveries: 0,
    navFailures: 0,
  };
}

/** Direction of the footpath at a node, used to offset conversation spots. */
function pathTangent(world: ResidentWorld, node: number): { x: number; z: number } {
  const here = world.nodes[node];
  if (!here) return { x: 1, z: 0 };
  for (const other of world.adjacency[node] ?? []) {
    const there = world.nodes[other];
    if (!there) continue;
    const dx = there.x - here.x;
    const dz = there.z - here.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.05) return { x: -dz / length, z: dx / length };
  }
  return { x: 1, z: 0 };
}

/** Shortest node path between two nodes, so a pair can come together. */
function routeTo(world: ResidentWorld, from: number, to: number): number[] {
  if (from === to) return [];
  const previous = new Map<number, number>();
  const queue = [from];
  previous.set(from, -1);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) break;
    for (const next of world.adjacency[current] ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(to)) {
    // Unreachable. Returning a wander here used to look like a route and left
    // people walking to a rendezvous they could never reach; the caller has to
    // know, so the answer is empty.
    return [];
  }
  // Reconstruct from the destination back to the origin, and stop at the
  // origin: the previous version walked back to the root and then shifted the
  // first entry, so a destination *adjacent* to the origin produced an empty
  // route — and every meeting between neighbours was cancelled as unreachable.
  const route: number[] = [];
  let step = to;
  while (step !== from) {
    route.unshift(step);
    const parent = previous.get(step);
    if (parent === undefined) return [];
    step = parent;
  }
  return route;
}

/**
 * Send two people to meet at a node between them.
 *
 * Picking the meeting point at the midpoint — rather than at a fixed point on
 * the far side of the circuit — is what makes pairs actually meet: with a fixed
 * point, one of them stood waiting for a minute while the other was still 80 m
 * away, and the rendezvous timed out.
 */
function planRendezvous(sim: ResidentSim, a: Resident, b: Resident, random: () => number): void {
  const world = sim.world;
  const fromA = nearestNodeIn(world, a.x, a.z, a.homeComponent);
  if (a.homeComponent !== b.homeComponent) {
    // The two stand on parts of the network that do not connect. There is no
    // honest meeting point, so do not invent one: record it and drop the plan.
    sim.unreachableMeetings += 1;
    for (const resident of [a, b]) {
      resident.partner = null;
      resident.spot = null;
      resident.meetingNode = null;
      resident.needsRendezvous = false;
      if (resident.state === "walking") {
        resident.route = routeFrom(world, nearestNode(world, resident.x, resident.z), 5, random);
        resident.routeIndex = 0;
      }
    }
    return;
  }
  const component = a.homeComponent;
  const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  let meeting = fromA;
  let best = Number.POSITIVE_INFINITY;
  world.nodes.forEach((node, index) => {
    if (world.component[index] !== component) return;
    const distance = (node.x - midpoint.x) ** 2 + (node.z - midpoint.z) ** 2;
    if (distance < best) {
      best = distance;
      meeting = index;
    }
  });
  const anchor = world.nodes[meeting] ?? { x: midpoint.x, z: midpoint.z };
  const tangent = pathTangent(world, meeting);

  // Work out both routes before touching either resident: a plan that fails for
  // one of them must not leave the other half-booked.
  const members: Array<{ resident: Resident; sign: 1 | -1; route: number[]; fromNode: number }> = [];
  for (const [resident, sign] of [[a, 1], [b, -1]] as const) {
    const fromNode = nearestNodeIn(world, resident.x, resident.z, resident.homeComponent);
    // An empty route is valid only when the person is already standing on the
    // meeting node. Treating that as "unreachable" cancelled every rendezvous
    // whose midpoint happened to be one of their own nodes.
    const route = fromNode === meeting ? [] : routeTo(world, fromNode, meeting);
    if (fromNode !== meeting && route.length === 0) {
      sim.unreachableMeetings += 1;
      for (const one of [a, b]) {
        one.partner = null;
        one.spot = null;
        one.meetingNode = null;
        one.needsRendezvous = false;
        if (one.state === "walking" && one.route.length === 0) {
          one.route = routeFrom(world, nearestNode(world, one.x, one.z), 5, random);
          one.routeIndex = 0;
        }
      }
      return;
    }
    members.push({ resident, sign, route, fromNode });
  }

  for (const { resident, sign, route, fromNode } of members) {
    resident.partner = sign === 1 ? b.index : a.index;
    resident.buddy = resident.partner;
    resident.meetingNode = meeting;
    resident.spot = {
      x: anchor.x + tangent.x * RESIDENTS.talkGap * sign,
      z: anchor.z + tangent.z * RESIDENTS.talkGap * sign,
    };
    resident.fromNode = fromNode;
    resident.route = route;
    resident.routeIndex = 0;
    resident.state = "walking";
    resident.stateAge = 0;
    resident.waiting = false;
    resident.needsRendezvous = false;
  }
}

/* ------------------------------------------------------------------ *
 * Stepping
 * ------------------------------------------------------------------ */

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function turnToward(resident: Resident, target: number, dt: number): void {
  const delta = shortestAngle(resident.rotationY, target);
  const step = clamp(delta, -RESIDENTS.turnRate * dt, RESIDENTS.turnRate * dt);
  resident.rotationY += step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Ease the speed toward a target, so nobody starts or stops on a single frame. */
function easeSpeed(resident: Resident, target: number, dt: number): void {
  const rate = target > resident.speed ? RESIDENTS.accel : RESIDENTS.decel;
  const delta = clamp(target - resident.speed, -rate * dt, rate * dt);
  resident.speed = Math.max(0, resident.speed + delta);
}

function resumeWalking(sim: ResidentSim, resident: Resident, random: () => number): void {
  resident.state = "walking";
  resident.stateAge = 0;
  resident.stuckFor = 0;
  resident.stuckX = resident.x;
  resident.stuckZ = resident.z;
  resident.fromNode = nearestNode(sim.world, resident.x, resident.z);
  resident.waiting = false;
  if (resident.needsRendezvous && resident.buddy !== null) {
    resident.needsRendezvous = false;
    const buddy = sim.residents[resident.buddy];
    if (buddy && buddy.buddy === resident.index && buddy.state !== "interacting") {
      planRendezvous(sim, resident, buddy, random);
      return;
    }
  }
  resident.route = routeFrom(sim.world, resident.fromNode, 4 + Math.floor(random() * 6), random);
  resident.routeIndex = 0;
  resident.spot = null;
}

function nearestNodeIn(world: ResidentWorld, x: number, z: number, component: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  world.nodes.forEach((node, index) => {
    if (world.component[index] !== component) return;
    const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best >= 0 ? best : nearestNode(world, x, z);
}

function nearestNode(world: ResidentWorld, x: number, z: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  world.nodes.forEach((node, index) => {
    const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/**
 * Advance the population.
 *
 * `dt` is clamped so a stalled tab cannot teleport anyone across the site. Each
 * resident is independent: no global React state, no allocation per frame.
 */
export function stepResidentSim(sim: ResidentSim, delta: number, random: () => number = mulberry32((sim.seed + Math.floor(sim.time * 1000)) >>> 0)): void {
  const dt = Math.min(Math.max(delta, 0), RESIDENTS.maxDelta);
  if (dt === 0) return;
  sim.time += dt;

  for (const resident of sim.residents) {
    resident.stateAge += dt;
    if (resident.state === "walking") stepWalking(sim, resident, dt, random);
    else if (resident.state === "pausing") stepPausing(sim, resident, dt, random);
    else if (resident.state === "interacting") stepInteracting(sim, resident, dt);
    else {
      // idle: a short beat before choosing something to do.
      resident.timer -= dt;
      resident.stride += dt * 0.9;
      if (resident.timer <= 0) resumeWalking(sim, resident, random);
    }
  }

  separateBodies(sim, dt);
  beginConversations(sim);
}

/**
 * Keep bodies out of each other.
 *
 * Slowing down near someone is not enough: two people following the same route
 * arrived at the same point and stayed there, one inside the other for the whole
 * session. This resolves any overlap directly, with a small cap per frame so
 * nobody is shoved off the footpath.
 */
function separateBodies(sim: ResidentSim, dt: number): void {
  const limit = RESIDENTS.minSeparation;
  // A small cap keeps the correction from becoming a sideways shove.
  const cap = 0.9 * dt;
  for (let i = 0; i < sim.residents.length; i += 1) {
    for (let j = i + 1; j < sim.residents.length; j += 1) {
      const a = sim.residents[i]!;
      const b = sim.residents[j]!;
      // Conversation partners stand at their own distance on purpose.
      if (a.partner === b.index && a.state === "interacting" && b.state === "interacting") continue;
      // A seated/standing pair may share a bench-level gap; walking may not.
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= limit) continue;
      const push = Math.min((limit - distance) * 0.5, cap);
      // Deterministic direction when they are exactly on top of each other.
      const nx = distance > 1e-4 ? dx / distance : Math.cos(a.index * 1.7);
      const nz = distance > 1e-4 ? dz / distance : Math.sin(a.index * 1.7);
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      leashToNetwork(sim, a);
      leashToNetwork(sim, b);
    }
  }
}

/**
 * Pull a walker back toward the segment it is walking when a nudge has moved it
 * too far off the footpath. Separation may never take someone onto the grass.
 */
function leashToNetwork(sim: ResidentSim, resident: Resident): void {
  if (resident.state !== "walking") return;
  const target = sim.world.nodes[resident.route[resident.routeIndex] ?? -1] ?? sim.world.nodes[resident.meetingNode ?? -1];
  if (!target) return;
  const from = sim.world.nodes[resident.fromNode] ?? target;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const lengthSq = dx * dx + dz * dz;
  // Standing on the node the leash is measured from: there is no segment, and
  // clamping to a single point would pin the walker in place forever.
  if (lengthSq < 1e-6) return;
  const t = Math.max(0, Math.min(1, ((resident.x - from.x) * dx + (resident.z - from.z) * dz) / lengthSq));
  const px = from.x + dx * t;
  const pz = from.z + dz * t;
  const offX = resident.x - px;
  const offZ = resident.z - pz;
  const off = Math.hypot(offX, offZ);
  const maxOff = 1.0;
  if (off <= maxOff) return;
  // Pull back gradually: a hard clamp moved the body up to a metre in a single
  // frame, which read as a teleport.
  const drift = off - maxOff;
  const pull = Math.min(drift, 1.6 / 60);
  resident.x -= (offX / off) * pull;
  resident.z -= (offZ / off) * pull;
}

function stepWalking(sim: ResidentSim, resident: Resident, dt: number, random: () => number): void {
  // Advance past every node already reached, so the body turns toward the node
  // it is actually heading for (and not the one it just left — that mistake left
  // people facing a corner for a whole step).
  while (resident.routeIndex < resident.route.length) {
    const node = sim.world.nodes[resident.route[resident.routeIndex]!];
    if (!node) {
      resident.routeIndex += 1;
      continue;
    }
    if (Math.hypot(node.x - resident.x, node.z - resident.z) < RESIDENTS.arrive) {
      resident.fromNode = resident.route[resident.routeIndex]!;
      resident.routeIndex += 1;
      continue;
    }
    break;
  }

  const nodeIndex = resident.route[resident.routeIndex];
  const node = nodeIndex !== undefined ? sim.world.nodes[nodeIndex] : undefined;
  const routeExhausted = node === undefined && resident.spot !== null;
  const target: { x: number; z: number } | null = node ?? resident.spot;

  if (routeExhausted && resident.meetingNode !== null && Math.hypot(resident.spot!.x - resident.x, resident.spot!.z - resident.z) > 2) {
    // The route ended somewhere other than the meeting point. Walking straight
    // at the spot from here would cross gardens and houses — re-route properly.
    resident.fromNode = nearestNode(sim.world, resident.x, resident.z);
    resident.route = routeTo(sim.world, resident.fromNode, resident.meetingNode);
    resident.routeIndex = 0;
    if (resident.route.length === 0) {
      // No way through: give up on this meeting rather than walking through walls.
      resident.spot = null;
      resident.meetingNode = null;
      resident.partner = null;
      resident.needsRendezvous = resident.buddy !== null;
      resident.state = "pausing";
      resident.stateAge = 0;
      resident.timer = RESIDENTS.pause.min;
      resident.speed = 0;
    }
    return;
  }

  if (!target) {
    // End of the route.
    if (resident.buddy !== null) {
      // Conversation partners keep meeting: walk some more, then arrange to see
      // each other again. Nobody is welded to a single spot.
      resident.state = "pausing";
      resident.stateAge = 0;
      resident.timer = 3 + random() * 7;
      resident.speed = 0;
      resident.needsRendezvous = true;
      return;
    }
    if (resident.activity === "independent" && resident.cruise > 2) {
      resumeWalking(sim, resident, random);
      return;
    }
    resident.state = "pausing";
    resident.stateAge = 0;
    resident.timer = RESIDENTS.pause.min + random() * (RESIDENTS.pause.max - RESIDENTS.pause.min);
    resident.speed = 0;
    if (resident.activity === "entrance" || resident.activity === "leisure") resident.timer += 10 + random() * 14;
    return;
  }

  const dx = target.x - resident.x;
  const dz = target.z - resident.z;
  const distance = Math.hypot(dx, dz);
  const headingToSpot = resident.route[resident.routeIndex] === undefined && resident.spot !== null;

  if (distance < (headingToSpot ? 0.22 : RESIDENTS.arrive)) {
    if (!headingToSpot) return;
    // At a conversation spot: wait, but never forever.
    resident.state = "pausing";
    resident.stateAge = 0;
    resident.waiting = true;
    resident.timer = RESIDENTS.conversation.rendezvous;
    resident.speed = 0;
    return;
  }

  // Steer around people coming the other way instead of walking into them.
  // Two people who simply push against each other never get anywhere: they
  // deadlocked head-on for minutes. People step aside; so do these — always to
  // their own right, so two of them choose opposite sides and actually pass.
  let mx = dx / distance;
  let mz = dz / distance;
  let desired = resident.cruise;
  let steer = 0;
  for (const other of sim.residents) {
    if (other === resident) continue;
    const ox = other.x - resident.x;
    const oz = other.z - resident.z;
    const gap = Math.hypot(ox, oz);
    if (gap < 1e-3) continue;
    if (gap < RESIDENTS.personalSpace) desired *= 0.45;
    if (gap > 1.6) continue;
    const ahead = (ox * mx + oz * mz) / gap;
    if (ahead < 0.6) continue;
    // Only step aside for someone actually coming towards us: two companions
    // walking abreast (or a line of people going the same way) should not keep
    // veering away from their own path.
    const facingBack = (Math.sin(other.rotationY) * -ox + Math.cos(other.rotationY) * -oz) / gap;
    if (other.state === "walking" && facingBack < 0.5 && gap > 0.8) continue;
    // A gentle sidestep: a strong steer made people walk diagonally for good.
    steer = Math.max(steer, 0.35 * (1 - gap / 1.6));
  }
  if (steer > 0) {
    // Rotate the heading to the right by a bounded amount.
    mx += -mz * steer;
    mz += mx * steer;
    const length = Math.hypot(mx, mz) || 1;
    mx /= length;
    mz /= length;
  }

  // Face where you are actually going.
  turnToward(resident, Math.atan2(mx, mz), dt);

  easeSpeed(resident, desired, dt);

  const step = Math.min(resident.speed * dt, distance);
  if (step > 0 && distance > 1e-6) {
    resident.x += mx * step;
    resident.z += mz * step;
    resident.travelled += step;
    resident.stride += (step / (RESIDENTS.strideMetres / 2)) * Math.PI;
  }

  // A walker that has not covered ground over a window is stuck, even if it is
  // jiggling back and forth. Recover from where the body actually is, so no
  // state can last forever.
  resident.stuckFor += dt;
  if (resident.stuckFor > 1.5) {
    const moved = Math.hypot(resident.x - resident.stuckX, resident.z - resident.stuckZ);
    resident.stuckFor = 0;
    resident.stuckX = resident.x;
    resident.stuckZ = resident.z;
    if (moved > 0.12) {
      // Fine: real progress was made in this window.
      return;
    }
    // Close to the target and still not arriving: the body is circling it
    // (steering and separation can keep it 0.5 m away indefinitely). Accept the
    // arrival instead of orbiting for a minute.
    const remaining = Math.hypot(target.x - resident.x, target.z - resident.z);
    if (remaining < 1.2) {
      // Close enough: accept it instead of orbiting, but never teleport the body.
      if (resident.route[resident.routeIndex] === undefined) {
        resident.state = "pausing";
        resident.stateAge = 0;
        resident.waiting = true;
        resident.timer = RESIDENTS.conversation.rendezvous;
        resident.speed = 0;
      } else {
        resident.fromNode = resident.route[resident.routeIndex]!;
        resident.routeIndex += 1;
      }
      return;
    }
    // No sideways teleport: that reads as sliding. Re-plan from where the body
    // is and let the walk (and its turning) do the work.
    resident.fromNode = nearestNode(sim.world, resident.x, resident.z);
    resident.homeComponent = sim.world.component[resident.fromNode] ?? resident.homeComponent;
    if (resident.spot) {
      // Re-route to the meeting point; if that is impossible, abandon it.
      const route = resident.meetingNode !== null ? routeTo(sim.world, resident.fromNode, resident.meetingNode) : [];
      if (route.length > 0) {
        resident.route = route;
        resident.routeIndex = 0;
      } else {
        resident.spot = null;
        resident.meetingNode = null;
        resident.partner = null;
        resident.needsRendezvous = resident.buddy !== null;
        resident.state = "pausing";
        resident.stateAge = 0;
        resident.timer = RESIDENTS.pause.min;
        resident.speed = 0;
      }
    } else {
      resident.route = routeFrom(sim.world, resident.fromNode, 5, random);
      resident.routeIndex = 0;
    }
    sim.stuckRecoveries += 1;
  }

  if (!Number.isFinite(resident.x) || !Number.isFinite(resident.z)) {
    resident.navFailures += 1;
    sim.navFailures += 1;
    resident.x = 0;
    resident.z = 0;
  }
}

function stepPausing(sim: ResidentSim, resident: Resident, dt: number, random: () => number): void {
  easeSpeed(resident, 0, dt);
  resident.timer -= dt;
  resident.stride += dt * 1.1;
  // Look around a little, so a standing person is not a statue.
  resident.rotationY += Math.sin(sim.time * 0.6 + resident.index) * dt * 0.35;

  if (resident.waiting && resident.partner !== null) {
    // The partner never showed (a blocked route, a cancelled plan). Abandon the
    // rendezvous instead of standing there for the rest of the session.
    if (resident.timer <= 0) {
      resident.waiting = false;
      resident.spot = null;
      resident.partner = null;
      resident.needsRendezvous = resident.buddy !== null;
      resumeWalking(sim, resident, random);
    }
    return;
  }
  if (resident.timer <= 0) resumeWalking(sim, resident, random);
}

function stepInteracting(sim: ResidentSim, resident: Resident, dt: number): void {
  easeSpeed(resident, 0, dt);
  resident.timer -= dt;
  resident.gesture += dt;
  resident.stride += dt * 0.7;
  const partner = resident.partner !== null ? sim.residents[resident.partner] : null;
  if (partner) {
    // Face the person you are talking to, always.
    turnToward(resident, Math.atan2(partner.x - resident.x, partner.z - resident.z), dt);
  }
  if (resident.timer <= 0) {
    endConversation(sim, resident);
  }
}

function beginConversations(sim: ResidentSim): void {
  const random = mulberry32((sim.seed + sim.conversations.started * 7919) >>> 0);
  for (const resident of sim.residents) {
    if (resident.partner === null || resident.state === "interacting") continue;
    if (resident.index > resident.partner) continue; // handle each pair once
    const partner = sim.residents[resident.partner];
    if (!partner) continue;
    if (resident.waiting && partner.waiting) {
      resident.state = "interacting";
      resident.stateAge = 0;
      partner.state = "interacting";
      partner.stateAge = 0;
      const seconds = RESIDENTS.conversation.min + random() * (RESIDENTS.conversation.max - RESIDENTS.conversation.min);
      resident.timer = seconds;
      partner.timer = seconds;
      partner.gesture = resident.gesture + Math.PI;
      resident.waiting = false;
      partner.waiting = false;
      sim.conversations.started += 1;
    }
  }
}

/**
 * End a conversation — for **both** people.
 *
 * The first version returned early when the partner was still interacting, and
 * so did the partner: each waited for the other to finish, and the pair stayed
 * frozen in conversation forever. Ending is a joint action.
 */
function endConversation(sim: ResidentSim, resident: Resident): void {
  if (resident.state !== "interacting") return;
  const partner = resident.partner !== null ? sim.residents[resident.partner] : null;
  const random = mulberry32((sim.seed + sim.conversations.ended * 104729) >>> 0);
  sim.conversations.ended += 1;
  for (const member of [resident, partner]) {
    if (!member) continue;
    member.state = "pausing";
    member.stateAge = 0;
    member.timer = 1.2 + random() * 2.2;
    member.waiting = false;
    member.spot = null;
    member.partner = null;
    member.speed = 0;
  }
}

/* ------------------------------------------------------------------ *
 * Posing (read by the renderer; no three.js here)
 * ------------------------------------------------------------------ */

export interface ResidentPose {
  bob: number;
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  armOutL: number;
  armOutR: number;
  lean: number;
}

const HALF_PI = Math.PI / 2;

/**
 * Joint angles for one resident, derived from state and phase.
 *
 * There are no skeletal animations in this project and no rigged human models;
 * this is a deliberately simple articulated figure — swinging limbs, a gait
 * bob, and an alternating hand gesture while talking. Nothing here claims to be
 * more than that.
 */
export function poseFor(resident: Resident): ResidentPose {
  const phase = resident.stride;
  if (resident.state === "walking") {
    const swing = Math.min(1, resident.speed / 1.3);
    return {
      bob: Math.abs(Math.cos(phase)) * 0.02 * swing,
      legL: Math.sin(phase) * 0.52 * swing,
      legR: -Math.sin(phase) * 0.52 * swing,
      armL: -Math.sin(phase) * 0.44 * swing,
      armR: Math.sin(phase) * 0.44 * swing,
      armOutL: 0.06,
      armOutR: 0.06,
      lean: 0.03 + swing * 0.045,
    };
  }
  if (resident.state === "interacting") {
    // Alternate which hand is doing the talking, so a pair does not mirror
    // each other like a drill team.
    const turn = Math.sin(resident.gesture * 0.7 + resident.index);
    const right = turn > 0;
    const lift = (0.55 + Math.sin(resident.gesture * 2.4) * 0.22) * (right ? 1 : 0.45);
    const leftLift = (0.45 + Math.sin(resident.gesture * 2.1 + 1.3) * 0.18) * (right ? 0.45 : 1);
    return {
      bob: Math.sin(resident.gesture * 1.4) * 0.006,
      legL: 0.03,
      legR: -0.03,
      // Positive swings the limb forward, so hands come up in front of the body
      // where a person talking actually gestures.
      armL: 0.12 + lift * 0.42,
      armR: 0.1 + leftLift * 0.38,
      armOutL: 0.1 + lift * 0.18,
      armOutR: 0.1 + leftLift * 0.18,
      lean: 0.02,
    };
  }
  // Standing: weight on one leg, small breath, hands near the body.
  const breath = Math.sin(phase * 0.9) * 0.006;
  return {
    bob: breath,
    legL: 0.05,
    legR: -0.05,
    armL: 0.05 + Math.sin(phase * 0.5) * 0.05,
    armR: -0.05 - Math.sin(phase * 0.5 + 0.8) * 0.05,
    armOutL: 0.09,
    armOutR: 0.09,
    lean: -0.01,
  };
}

export const RESIDENT_LIMB = {
  hipHeight: 0.88,
  shoulderHeight: 1.44,
  headCentre: 1.63,
  hipHalf: 0.085,
  shoulderHalf: 0.21,
  legLength: 0.86,
  armLength: 0.58,
  referenceHeight: 1.78,
  halfPi: HALF_PI,
} as const;

/** Live counts for the debug panel. */
export function residentCounts(sim: ResidentSim): {
  created: number;
  walking: number;
  pausing: number;
  interacting: number;
  idle: number;
} {
  let walking = 0;
  let pausing = 0;
  let interacting = 0;
  let idle = 0;
  for (const resident of sim.residents) {
    if (resident.state === "walking") walking += 1;
    else if (resident.state === "pausing") pausing += 1;
    else if (resident.state === "interacting") interacting += 1;
    else idle += 1;
  }
  return { created: sim.residents.length, walking, pausing, interacting, idle };
}
