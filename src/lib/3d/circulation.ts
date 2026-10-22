import { getFloorPlan } from "@/lib/domain/floorplans";
import { PLOT, SITE, garagePlan, plotRearDepth, plotWallsFor, pointOnRoad, pointInRect, type Rect } from "./site";
import type { Typology } from "@/lib/domain/types";

/**
 * Circulation.
 *
 * The site had carriageways and driveways but no pedestrian network at all: a
 * visitor walking through the gate had no drawn route to any door, and nothing
 * checked that one existed. This module derives a footpath network from the same
 * `SITE` data the roads use, turns it into a graph, and answers the only
 * question that matters: **can you walk from the gate to every front door?**
 *
 * Polylines are authored in world coordinates (metres). Sampling them at a fixed
 * step gives graph nodes; segments give edges. Spurs connect each house's front
 * door to the nearest path point.
 */

export const PATH = {
  /** Clear width of a footpath. Below 1.2 m two people cannot pass. */
  width: 2.2,
  /** Inside the circuit, measured from the inner kerb. */
  ringInset: 1.9,
  /** Along the boulevard, from the carriageway kerb. */
  boulevardOffset: 5.5,
  /** Around the lagoon deck. */
  lagoonClearance: 1.8,
  /** Graph node spacing along a polyline. */
  sample: 2,
  /** Two graph nodes closer than this are joined (paths that meet). */
  joinRadius: 1.2,
  /** A footpath keeps this clear of any carriageway, or it is a crossing. */
  kerbClearance: 0.6,
  /** Endpoints closer than this are snapped onto an existing path node. */
  snap: 4,
  /** Longest gap allowed between a front door and the footpath serving it. */
  doorLink: 3.5,
  /** A run over tarmac longer than this is not a crossing: the path is on the road. */
  maxCrossing: 12,
} as const;

export interface PathPoint {
  x: number;
  z: number;
}

export interface Footpath {
  id: string;
  kind: "ring" | "boulevard" | "crossing" | "lagoon" | "spur" | "service" | "sports";
  /** World-space polyline, already sampled for rendering and for the graph. */
  points: PathPoint[];
  width: number;
}

export interface Entrance {
  code: string;
  /** World-space position of the front door. */
  point: PathPoint;
  /** Facing of the house, in degrees. */
  rotationY: number;
}

export interface CirculationGraph {
  nodes: Array<PathPoint & { id: string }>;
  edges: Array<[number, number]>;
  entranceNodes: Array<{ code: string; node: number }>;
  gateNode: number;
}

export interface CirculationReport {
  paths: Footpath[];
  graph: CirculationGraph;
  reachable: Set<string>;
  unreachable: string[];
  /** Longest walking distance from the gate to a front door, in metres. */
  worstWalk: number;
  /** Walking distance from the gate to each front door, in metres. */
  walks: Array<{ code: string; metres: number | null }>;
  entrances: Entrance[];
}

/** Sample a polyline at a fixed step, keeping the final point. */
function sample(points: PathPoint[], step: number = PATH.sample): PathPoint[] {
  if (points.length < 2) return points;
  const out: PathPoint[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.max(1, Math.round(length / step));
    for (let k = 1; k <= count; k += 1) {
      out.push({ x: a.x + ((b.x - a.x) * k) / count, z: a.z + ((b.z - a.z) * k) / count });
    }
  }
  return out;
}

/** Rounded-rectangle loop at a fixed offset outside a rect (negative = inside). */
function roundedLoop(rect: Rect & { radius: number }, offset: number): PathPoint[] {
  const minX = rect.minX - offset;
  const maxX = rect.maxX + offset;
  const minZ = rect.minZ - offset;
  const maxZ = rect.maxZ + offset;
  const radius = Math.max(1.2, rect.radius + offset);
  const corners: Array<{ cx: number; cz: number; from: number }> = [
    { cx: maxX - radius, cz: maxZ - radius, from: 0 },
    { cx: minX + radius, cz: maxZ - radius, from: 90 },
    { cx: minX + radius, cz: minZ + radius, from: 180 },
    { cx: maxX - radius, cz: minZ + radius, from: 270 },
  ];

  // A rounded rectangle is four arcs **and four straight sides**. Emitting only
  // the arcs gives four disconnected quarter-circles, which silently breaks the
  // graph: nothing joins, and every crossing lands in the void between corners.
  const points: PathPoint[] = [];
  corners.forEach((corner, index) => {
    for (let a = 0; a <= 90; a += 6) {
      const rad = ((corner.from + a) * Math.PI) / 180;
      points.push({ x: corner.cx + Math.cos(rad) * radius, z: corner.cz + Math.sin(rad) * radius });
    }
    const next = corners[(index + 1) % corners.length]!;
    const end = points[points.length - 1]!;
    const start = {
      x: next.cx + Math.cos((next.from * Math.PI) / 180) * radius,
      z: next.cz + Math.sin((next.from * Math.PI) / 180) * radius,
    };
    const length = Math.hypot(start.x - end.x, start.z - end.z);
    const steps = Math.max(1, Math.round(length / PATH.sample));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      points.push({ x: end.x + (start.x - end.x) * t, z: end.z + (start.z - end.z) * t });
    }
  });
  // Close the perimeter. Without this the loop ends one sample short of where it
  // began, and the gap is wider than the join radius: the ring reads as a closed
  // loop but the graph sees a broken circle.
  points.push({ ...points[0]! });
  return points;
}

/** Ellipse loop around the lagoon deck. */
function lagoonLoop(): PathPoint[] {
  const { x, z, radiusX, radiusZ, deck } = SITE.lagoon;
  const points: PathPoint[] = [];
  for (let a = 0; a < 360; a += 6) {
    const rad = (a * Math.PI) / 180;
    points.push({
      x: x + Math.cos(rad) * (radiusX + deck + PATH.lagoonClearance),
      z: z + Math.sin(rad) * (radiusZ + deck + PATH.lagoonClearance),
    });
  }
  return points;
}

/**
 * Front door and the walking spur to it.
 *
 * The door sits on the façade; the spur starts in the front garden, clear of the
 * carport, and runs out to the ring path. `garagePlan` decides which side the
 * carport takes, so the spur uses the opposite side.
 */
export function entranceFor(
  code: string,
  position: PathPoint,
  rotationY: number,
  typology: Typology,
): { entrance: Entrance; spurStart: PathPoint } {
  const plan = getFloorPlan(typology);
  const rad = (rotationY * Math.PI) / 180;
  const facing = { x: Math.sin(rad), z: Math.cos(rad) };
  const side = { x: Math.cos(rad), z: -Math.sin(rad) };
  const door = {
    x: position.x + facing.x * (plan.depthM / 2 + 0.35),
    z: position.z + facing.z * (plan.depthM / 2 + 0.35),
  };
  const { garage } = garagePlan(position, rotationY, typology);
  // Walk past the carport on the free side; 2.6 m off the door axis.
  const lateral = garage && garage.x > 0 ? -2.6 : 2.6;
  const spurStart = { x: door.x + side.x * lateral, z: door.z + side.z * lateral };
  return { entrance: { code, point: { x: door.x, z: door.z }, rotationY }, spurStart };
}

/**
 * Split a path wherever it has to cross a carriageway.
 *
 * A pedestrian route that runs over tarmac is not necessarily wrong — junctions
 * need crossings — but it must be drawn and flagged as a crossing, never as an
 * ordinary verge path. This walks the samples, groups the stretches that sit on
 * a road, and returns them as `crossing` paths joined to their neighbours.
 */
export function splitRoadCrossings(path: Footpath): Footpath[] {
  const onRoad = path.points.map((point) => pointOnRoad(point.x, point.z, PATH.kerbClearance));
  if (!onRoad.some(Boolean)) return [path];

  const out: Footpath[] = [];
  let run: PathPoint[] = [];
  let runOnRoad = onRoad[0]!;
  let index = 0;
  const flush = () => {
    if (run.length < 2) return;
    // Only a short, straight run across the road is a crossing. A long run that
    // follows the carriageway is a defect, and calling it a crossing would hide
    // it: the kind stays as authored, so `onCarriageway` reports it.
    const length = run.slice(1).reduce((total, point, i) => total + Math.hypot(point.x - run[i]!.x, point.z - run[i]!.z), 0);
    const isCrossing = runOnRoad && length <= PATH.maxCrossing;
    out.push({
      id: `${path.id}:${isCrossing ? "crossing" : "walk"}:${index}`,
      kind: isCrossing ? "crossing" : path.kind,
      points: run,
      width: isCrossing ? Math.max(path.width, 2.4) : path.width,
    });
    index += 1;
  };
  for (let i = 0; i < path.points.length; i += 1) {
    const point = path.points[i]!;
    const flag = onRoad[i]!;
    if (flag !== runOnRoad) {
      // Share the boundary point so the two halves stay connected.
      run.push(point);
      flush();
      run = [point];
      runOnRoad = flag;
    } else {
      run.push(point);
    }
  }
  flush();
  return out;
}

/**
 * Make shared endpoints coincide exactly.
 *
 * Path polylines are authored independently, so a verge can end 15 cm short of
 * the loop it serves — or 1.5 m short, depending on where the loop happens to
 * be sampled. Joining then depends on luck: one side of a junction connected and
 * the other did not, which silently sent pedestrians the long way round the
 * site. Snapping endpoints onto the already-accepted network removes the luck.
 */
function snapEndpoints(paths: Footpath[], tolerance: number): Footpath[] {
  const accepted: PathPoint[] = [];
  const snapped: Footpath[] = [];
  const snap = (point: PathPoint): PathPoint => {
    let best: PathPoint | null = null;
    let bestDistance = tolerance;
    for (const candidate of accepted) {
      const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best ? { x: best.x, z: best.z } : { x: point.x, z: point.z };
  };
  for (const path of paths) {
    const points = path.points.map((point) => ({ x: point.x, z: point.z }));
    // Closed loops are the reference geometry; everything else meets them.
    if (path.kind !== "ring" && path.kind !== "lagoon" && points.length > 1) {
      points[0] = snap(points[0]!);
      points[points.length - 1] = snap(points[points.length - 1]!);
    }
    snapped.push({ ...path, points });
    accepted.push(...points);
  }
  return snapped;
}

/** The authored path network for a set of houses. */
export function footpaths(entries: Array<{ code: string; position: PathPoint; rotationY: number; typology: Typology }>): Footpath[] {
  /**
   * Two loops, not one. The houses front the circuit from the outside, so the
   * pedestrian spine runs along the **outer** verge (between the kerb and the
   * front gardens); the central garden and the lagoon have their own loop on the
   * inside, joined to the spine by two marked crossings.
   */
  const outerLoop = roundedLoop(SITE.ring.outer, PATH.ringInset);
  const innerLoop = roundedLoop(SITE.ring.inner, -PATH.ringInset);
  const paths: Footpath[] = [
    { id: "path/ring-outer", kind: "ring", points: sample(outerLoop), width: PATH.width },
    { id: "path/ring-inner", kind: "ring", points: sample(innerLoop), width: PATH.width },
  ];

  // Two crossings over the carriageway: east and west, clear of every driveway.
  for (const side of [-1, 1]) {
    paths.push({
      id: `path/crossing/${side > 0 ? "east" : "west"}`,
      kind: "crossing",
      points: sample([
        { x: side * (SITE.ring.inner.maxX - PATH.ringInset), z: 0 },
        { x: side * (SITE.ring.outer.maxX + PATH.ringInset), z: 0 },
      ]),
      width: 2.6,
    });
  }

  // The arrival axis. The boulevard lands on the ring at x = 0, so the garden is
  // entered straight ahead from the gate instead of by walking half the circuit
  // to the z = 0 crossings first.
  paths.push({
    id: "path/crossing/north",
    kind: "crossing",
    points: sample([
      { x: 0, z: SITE.ring.inner.maxZ - PATH.ringInset },
      { x: 0, z: SITE.ring.outer.maxZ + PATH.ringInset },
    ]),
    width: 2.6,
  });

  // Boulevard verges, from the gate down to the outer loop at the junction.
  const gateZ = SITE.gate.z - 2;
  const junctionZ = SITE.ring.outer.maxZ + PATH.ringInset;
  for (const side of [-1, 1]) {
    paths.push({
      id: `path/boulevard/${side > 0 ? "east" : "west"}`,
      kind: "boulevard",
      points: sample([
        { x: side * PATH.boulevardOffset, z: gateZ },
        { x: side * PATH.boulevardOffset, z: junctionZ },
      ]),
      width: PATH.width,
    });
  }

  paths.push({ id: "path/lagoon", kind: "lagoon", points: sample(lagoonLoop(), 3), width: 1.8 });

  // Service road verge, from the circuit to the sports park and the clubhouse.
  paths.push({
    id: "path/service",
    kind: "service",
    points: sample([
      { x: SITE.ring.outer.minX - PATH.ringInset, z: SITE.serviceRoad.maxZ + 1.2 },
      { x: SITE.serviceRoad.minX - 1.2, z: SITE.serviceRoad.maxZ + 1.2 },
    ]),
    width: PATH.width,
  });
  paths.push({
    id: "path/sports",
    kind: "sports",
    points: sample([
      { x: SITE.serviceRoad.minX - 1.2, z: SITE.serviceRoad.maxZ + 1.2 },
      { x: SITE.serviceRoad.minX - 1.2, z: 60 },
    ]),
    width: PATH.width,
  });

  // A spur from the outer verge to every front garden. The target must be **in
  // front** of the house: the nearest point on the loop is sometimes behind it,
  // and a spur drawn to the nearest point would run straight through the house.
  for (const entry of entries) {
    const { entrance, spurStart } = entranceFor(entry.code, entry.position, entry.rotationY, entry.typology);
    const rad = (entry.rotationY * Math.PI) / 180;
    const halfDepth = getFloorPlan(entry.typology).depthM / 2;
    const nearest = nearestPoint(outerLoop, spurStart, {
      facing: { x: Math.sin(rad), z: Math.cos(rad) },
      origin: entry.position,
      // Clear of the façade, not merely of the house centre: a point can be
      // "in front" of the centre and still inside the footprint.
      minAhead: halfDepth + 1.5,
    });
    paths.push({
      id: `path/spur/${entry.code}`,
      kind: "spur",
      points: sample([entrance.point, spurStart, nearest], 1.5),
      width: 1.5,
    });
  }

  // Rings first (they are the reference), then everything that joins them.
  const order: Footpath["kind"][] = ["ring", "lagoon", "boulevard", "service", "sports", "crossing", "spur"];
  const ordered = [...paths].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const joined = snapEndpoints(ordered, PATH.snap);
  // Any stretch that ends up on tarmac becomes a marked crossing, so the network
  // is honest about where people share space with vehicles.
  return joined.flatMap(splitRoadCrossings);
}

function nearestPoint(
  points: PathPoint[],
  target: PathPoint,
  front?: { facing: PathPoint; origin: PathPoint; minAhead: number },
): PathPoint {
  let best: PathPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    // Only consider points on the façade side of the house.
    if (front) {
      const ahead = (point.x - front.origin.x) * front.facing.x + (point.z - front.origin.z) * front.facing.z;
      if (ahead < front.minAhead) continue;
    }
    const distance = Math.hypot(point.x - target.x, point.z - target.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best ?? nearestPoint(points, target);
}

/** Build the graph: path samples become nodes, then link whatever meets. */
export function circulationGraph(paths: Footpath[], entrances: Entrance[]): CirculationGraph {
  const nodes: Array<PathPoint & { id: string }> = [];
  const edges: Array<[number, number]> = [];

  for (const path of paths) {
    let previous = -1;
    for (const point of path.points) {
      nodes.push({ ...point, id: `${path.id}@${nodes.length}` });
      const index = nodes.length - 1;
      if (previous >= 0) edges.push([previous, index]);
      previous = index;
    }
  }

  // Join paths that meet: separate polylines share no nodes by construction.
  const grid = new Map<string, number[]>();
  const cell = (value: number) => Math.round(value / PATH.joinRadius);
  nodes.forEach((node, index) => {
    const key = `${cell(node.x)}:${cell(node.z)}`;
    const bucket = grid.get(key) ?? [];
    bucket.push(index);
    grid.set(key, bucket);
  });
  nodes.forEach((node, index) => {
    const cx = cell(node.x);
    const cz = cell(node.z);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (const other of grid.get(`${cx + dx}:${cz + dz}`) ?? []) {
          if (other <= index) continue;
          if (Math.hypot(nodes[other]!.x - node.x, nodes[other]!.z - node.z) <= PATH.joinRadius) edges.push([index, other]);
        }
      }
    }
  });

  const entranceNodes = entrances.map((entrance) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    nodes.forEach((node, index) => {
      const distance = Math.hypot(node.x - entrance.point.x, node.z - entrance.point.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    // A door only counts as served if a path actually reaches it. Connecting
    // regardless of distance would make every house "reachable" on paper.
    if (bestDistance <= PATH.doorLink) edges.push([bestIndex, nodes.length]);
    nodes.push({ ...entrance.point, id: `door/${entrance.code}` });
    return { code: entrance.code, node: nodes.length - 1 };
  });

  // The gate itself is a node, wired to the nearest path point.
  const gate = { x: SITE.gate.x, z: SITE.gate.z - 2 };
  let gateNearest = 0;
  let gateDistance = Number.POSITIVE_INFINITY;
  nodes.forEach((node, index) => {
    const distance = Math.hypot(node.x - gate.x, node.z - gate.z);
    if (distance < gateDistance) {
      gateDistance = distance;
      gateNearest = index;
    }
  });
  edges.push([gateNearest, nodes.length]);
  nodes.push({ ...gate, id: "gate" });
  const gateNode = nodes.length - 1;

  return { nodes, edges, entranceNodes, gateNode };
}

/** Breadth-first reachability from the gate. */
export function reachability(graph: CirculationGraph): { reachable: Set<string>; distance: Map<number, number> } {
  const adjacency = new Map<number, number[]>();
  for (const [a, b] of graph.edges) {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
  }
  const distance = new Map<number, number>([[graph.gateNode, 0]]);
  const queue = [graph.gateNode];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (distance.has(next)) continue;
      const step = Math.hypot(graph.nodes[next]!.x - graph.nodes[current]!.x, graph.nodes[next]!.z - graph.nodes[current]!.z);
      distance.set(next, (distance.get(current) ?? 0) + step);
      queue.push(next);
    }
  }
  const reachable = new Set<string>();
  for (const [index] of distance) reachable.add(graph.nodes[index]!.id);
  return { reachable, distance };
}

/** Full circulation report: paths, graph, who can be reached and how far. */
export function circulation(
  entries: Array<{ code: string; position: PathPoint; rotationY: number; typology: Typology }>,
  /** Test seam: a deliberately broken network, to prove the rules fire. */
  network: Footpath[] = footpaths(entries),
): CirculationReport {
  const paths = network;
  const entrances = entries.map((entry) => entranceFor(entry.code, entry.position, entry.rotationY, entry.typology).entrance);
  const graph = circulationGraph(paths, entrances);
  const { reachable, distance } = reachability(graph);

  const unreachable: string[] = [];
  let worstWalk = 0;
  const walks: Array<{ code: string; metres: number | null }> = [];
  for (const entrance of graph.entranceNodes) {
    if (!distance.has(entrance.node)) {
      unreachable.push(entrance.code);
      continue;
    }
    worstWalk = Math.max(worstWalk, distance.get(entrance.node)!);
    walks.push({ code: entrance.code, metres: distance.get(entrance.node) ?? null });
  }

  return { paths, graph, reachable, unreachable, worstWalk, walks, entrances };
}

/** Every sampled path point, for clearance checks. */
export function pathPoints(paths: Footpath[]): Array<{ id: string; x: number; z: number; width: number }> {
  return paths.flatMap((path) => path.points.map((point, index) => ({ id: `${path.id}#${index}`, x: point.x, z: point.z, width: path.width })));
}

/** True when a point is inside a private plot's walled garden. */
export function insidePlotInterior(x: number, z: number, position: PathPoint, rotationY: number, typology: Typology): boolean {
  const rearDepth = plotRearDepth(position, rotationY, typology);
  const walls = plotWallsFor(typology, rearDepth);
  const rad = (rotationY * Math.PI) / 180;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const wall of walls) {
    for (const [lx, lz] of [
      [wall.x - wall.width / 2, wall.z - wall.depth / 2],
      [wall.x + wall.width / 2, wall.z - wall.depth / 2],
      [wall.x - wall.width / 2, wall.z + wall.depth / 2],
      [wall.x + wall.width / 2, wall.z + wall.depth / 2],
    ] as const) {
      const wx = position.x + lx * Math.cos(rad) + lz * Math.sin(rad);
      const wz = position.z - lx * Math.sin(rad) + lz * Math.cos(rad);
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minZ = Math.min(minZ, wz);
      maxZ = Math.max(maxZ, wz);
    }
  }
  return pointInRect(x, z, { minX, maxX, minZ, maxZ });
}

/** Footpaths must never run across a carriageway except at a marked crossing. */
export function onCarriageway(path: Footpath): boolean {
  if (path.kind === "crossing") return false;
  // The first and last sample are shared with the crossing that continues the
  // route, so they sit on the tarmac by construction. Everything between them
  // must stay clear of it.
  const interior = path.points.length > 2 ? path.points.slice(1, -1) : [];
  return interior.some((point) => pointOnRoad(point.x, point.z, PATH.kerbClearance));
}

export type { Rect };
export { PLOT };
