import type { Typology } from "@/lib/domain/types";
import {
  COURTS,
  CLUBHOUSE,
  GARDEN_BOUNDS,
  SITE,
  courtBounds,
  drivewayFor,
  facingVector,
  footprintExtents,
  garagePlan,
  lampPositions,
  plotFootprint,
  plotRearDepth,
  plotWallsFor,
  pointOnRoad,
  poolFor,
  scatterFlowers,
  scatterShrubs,
  scatterTrees,
  sportsKeepOut,
  type Driveway,
  type GarageSpec,
  type PoolSpec,
  type Rect,
} from "./site";
import {
  partBounds,
  partTriangleBudget,
  plotParts,
  type Part,
  type PartBounds,
  type PlotPartsInput,
} from "./parts";

/**
 * Spatial validation for the masterplan.
 *
 * The scene is described by data (see `lib/3d/parts.ts`), so the same numbers
 * that drive the renderer can be checked without a GPU. Every finding carries
 * an object id, a category, a severity, the offending footprint and a concrete
 * correction — the point is to fix placement *rules*, not to nudge meshes until
 * a screenshot looks right.
 *
 * Severities
 *   critical — the environment is unusable: a building on a road, two buildings
 *              overlapping, an unreachable house.
 *   high     — a functional defect: a carport or pool clashing with a neighbour,
 *              vegetation inside a private plot, an object through the fence.
 *   medium   — spatial composition: double boundary walls, furniture off its
 *              deck, a plot that could have parking but has none.
 *   low      — presentation: a lamp on the carriageway, a redundant element.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingCategory =
  | "circulation"
  | "overlap"
  | "boundary"
  | "clearance"
  | "composition"
  | "grounding";

export interface SceneEntryInput {
  property: { code: string; typology: Typology };
  position: { x: number; z: number };
  rotationY: number;
}

export interface Finding {
  /** Stable id of the object at fault, e.g. "H05/carport/roof". */
  objectId: string;
  /** Plot or asset code that owns the object. */
  subject: string;
  category: FindingCategory;
  severity: Severity;
  message: string;
  /** World-space footprint of the offending object, when applicable. */
  footprint?: { x: number; z: number; width: number; depth: number };
  /** Concrete correction, phrased as a rule rather than a nudge. */
  suggestion: string;
  /** True when the finding comes from geometry; false when it needs a human eye. */
  confirmed: boolean;
}

export interface SceneReport {
  findings: Finding[];
  counts: Record<Severity, number>;
  ok: boolean;
  checked: {
    houses: number;
    plots: number;
    pools: number;
    carports: number;
    parts: number;
    trees: number;
    flowers: number;
    /** Draw calls the merged plot meshes need (one mesh per material). */
    plotDrawCalls: number;
    /** Triangle budget of the plot parts, computed from primitive types. */
    plotTriangles: number;
  };
}

export interface ValidateOptions {
  entries: SceneEntryInput[];
  /** Include greenery checks (scatter is deterministic, so this is cheap). */
  vegetation?: boolean;
  lowQuality?: boolean;
}

export const SPATIAL_RULES = [
  "A house footprint must never intersect a carriageway, another house or the perimeter.",
  "Every house must reach the road network with a driveway shorter than 24 m.",
  "Plot boundary walls, carports and pools must stay inside the perimeter fence.",
  "A plot may not intrude on a neighbouring plot's house, carport or pool.",
  "Pool furniture must sit on the pool deck; canopies may overhang it if they clear the walls vertically.",
  "Vegetation may only live in planting beds — never inside a plot, on a road, on a court or in the lagoon.",
  "Sports courts must be disjoint, inside the perimeter and clear of every house.",
  "Street lamps belong beside the carriageway, never on it and never inside a plot.",
] as const;

function rectOf(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX, maxX, minZ, maxZ };
}

function overlaps(a: Rect, b: Rect, epsilon = 1e-6): boolean {
  return a.minX < b.maxX - epsilon && a.maxX > b.minX + epsilon && a.minZ < b.maxZ - epsilon && a.maxZ > b.minZ + epsilon;
}

function intersectArea(a: Rect, b: Rect): Rect | null {
  const r = rectOf(Math.max(a.minX, b.minX), Math.max(a.minZ, b.minZ), Math.min(a.maxX, b.maxX), Math.min(a.maxZ, b.maxZ));
  return r.maxX > r.minX && r.maxZ > r.minZ ? r : null;
}

function footprintOf(rect: Rect): Finding["footprint"] {
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2, width: rect.maxX - rect.minX, depth: rect.maxZ - rect.minZ };
}

function houseRect(entry: SceneEntryInput): Rect {
  const { hx, hz } = footprintExtents(entry.property.typology, entry.rotationY);
  return rectOf(entry.position.x - hx, entry.position.z - hz, entry.position.x + hx, entry.position.z + hz);
}

function insideFence(rect: Rect): boolean {
  return (
    rect.minX >= GARDEN_BOUNDS.minX - 1e-6 &&
    rect.maxX <= GARDEN_BOUNDS.maxX + 1e-6 &&
    rect.minZ >= GARDEN_BOUNDS.minZ - 1e-6 &&
    rect.maxZ <= GARDEN_BOUNDS.maxZ + 1e-6
  );
}

function partWorldBounds(parts: Part[], entry: SceneEntryInput): Array<{ part: Part; bounds: PartBounds }> {
  return parts.map((part) => ({ part, bounds: partBounds(part, entry.position, entry.rotationY) }));
}

function plotInterior(entry: SceneEntryInput, walls: ReturnType<typeof plotWallsFor>): Rect {
  const corners = walls.map((wall) => {
    const b = partBounds(
      { id: "tmp", group: "boundary", material: "render", shape: { kind: "box", size: [wall.width, wall.height, wall.depth], position: [wall.x, wall.height / 2, wall.z] } },
      entry.position,
      entry.rotationY,
    );
    return b;
  });
  return rectOf(
    Math.min(...corners.map((c) => c.minX)),
    Math.min(...corners.map((c) => c.minZ)),
    Math.max(...corners.map((c) => c.maxX)),
    Math.max(...corners.map((c) => c.maxZ)),
  );
}

/** Longest driveway a plot may have before it stops reading as a front garden. */
const MAX_DRIVEWAY = 24;

/** Axis-aligned bounds of a driveway ribbon: length along its facing axis. */
function drivewayBounds(driveway: Driveway): Rect {
  const dir = facingVector(driveway.rotationY);
  const hx = (Math.abs(dir.x) * driveway.length) / 2 + (Math.abs(dir.z) * driveway.width) / 2;
  const hz = (Math.abs(dir.z) * driveway.length) / 2 + (Math.abs(dir.x) * driveway.width) / 2;
  return rectOf(driveway.x - hx, driveway.z - hz, driveway.x + hx, driveway.z + hz);
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function validateScene({ entries, vegetation = true, lowQuality = true }: ValidateOptions): SceneReport {
  const findings: Finding[] = [];
  const houses = new Map<string, Rect>();
  for (const entry of entries) houses.set(entry.property.code, houseRect(entry));

  const plots = entries.map((entry) => {
    const rearDepth = plotRearDepth(entry.position, entry.rotationY, entry.property.typology);
    const walls = plotWallsFor(entry.property.typology, rearDepth);
    const { garage } = garagePlan(entry.position, entry.rotationY, entry.property.typology);
    const pool = poolFor(entry.property.code, entry.property.typology, rearDepth);
    const seed = Number(entry.property.code.replace(/\D/g, "")) || 1;
    const input: PlotPartsInput = { code: entry.property.code, rearDepth, walls, garage, pool, seed, lowQuality };
    const parts = plotParts(input);
    const interior = plotInterior(entry, walls);
    return {
      entry,
      rearDepth,
      walls,
      garage,
      pool,
      parts,
      interior,
      // Same rectangle the renderer excludes planting and lamps from.
      footprint: plotFootprint(entry.position, entry.rotationY, entry.property.typology, rearDepth),
    };
  });

  /* ── Houses: roads, neighbours, perimeter, circulation ─────────────── */
  for (const entry of entries) {
    const code = entry.property.code;
    const rect = houses.get(code)!;

    for (let x = rect.minX; x <= rect.maxX + 1e-6; x += 0.5) {
      let hit = false;
      for (let z = rect.minZ; z <= rect.maxZ + 1e-6; z += 0.5) {
        if (pointOnRoad(x, z, 0)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        findings.push({
          objectId: `${code}/house`,
          subject: code,
          category: "circulation",
          severity: "critical",
          message: `${code} footprint intersects a carriageway.`,
          footprint: footprintOf(rect),
          suggestion: "Move the plot out of the road band, or reroute the road so it runs clear of the façade.",
          confirmed: true,
        });
        break;
      }
    }

    if (!insideFence(rect)) {
      findings.push({
        objectId: `${code}/house`,
        subject: code,
        category: "boundary",
        severity: "critical",
        message: `${code} footprint crosses the perimeter fence.`,
        footprint: footprintOf(rect),
        suggestion: "Pull the house inside SITE_BOUNDS; the fence and the placement schema must agree.",
        confirmed: true,
      });
    }

    for (const other of entries) {
      if (other.property.code <= code) continue;
      const otherRect = houses.get(other.property.code)!;
      const area = intersectArea(rect, otherRect);
      if (area) {
        findings.push({
          objectId: `${code}/house`,
          subject: code,
          category: "overlap",
          severity: "critical",
          message: `${code} overlaps ${other.property.code} by ${(area.maxX - area.minX).toFixed(1)} × ${(area.maxZ - area.minZ).toFixed(1)} m.`,
          footprint: footprintOf(area),
          suggestion: "Respace the row: plots need width + side margins between centres.",
          confirmed: true,
        });
      }
    }
  }

  /* ── Plots: walls, carports, pools and furniture ───────────────────── */
  let poolCount = 0;
  let carportCount = 0;
  let partCount = 0;
  let plotDrawCalls = 0;
  let plotTriangles = 0;

  for (const plot of plots) {
    const { entry, garage, pool, parts } = plot;
    const code = entry.property.code;
    partCount += parts.length;
    plotDrawCalls += new Set(parts.map((part) => part.material)).size;
    plotTriangles += partTriangleBudget(parts);
    if (pool) poolCount += 1;
    if (garage) carportCount += 1;

    const classified = partWorldBounds(parts, entry);
    for (const { part, bounds } of classified) {
      if (!insideFence(bounds)) {
        findings.push({
          objectId: part.id,
          subject: code,
          category: "boundary",
          severity: part.group === "car" || part.group === "boundary" ? "high" : "medium",
          message: `${part.id} crosses the perimeter fence.`,
          footprint: footprintOf(bounds),
          suggestion: "Clip the plot to GARDEN_BOUNDS: reduce rearDepth or sideMargin for this typology.",
          confirmed: true,
        });
      }
      for (const other of entries) {
        if (other.property.code === code) continue;
        const otherHouse = houses.get(other.property.code)!;
        if (overlaps(bounds, otherHouse)) {
          findings.push({
            objectId: part.id,
            subject: code,
            category: "overlap",
            severity: part.group === "boundary" ? "high" : "high",
            message: `${part.id} intrudes on ${other.property.code}'s house.`,
            footprint: footprintOf(bounds),
            suggestion: "Boundary walls and carports must stay inside the plot's own half-pitch; check sideMargin and the parking offset.",
            confirmed: true,
          });
        }
      }
    }

    // Double boundary walls between neighbours read as one thick wall in 3D,
    // so they are reported as a composition issue rather than an overlap.
    for (const other of plots) {
      if (other.entry.property.code <= code) continue;
      for (const part of parts) {
        if (part.group !== "boundary") continue;
        const a = partBounds(part, entry.position, entry.rotationY);
        for (const otherPart of other.parts) {
          if (otherPart.group !== "boundary") continue;
          const b = partBounds(otherPart, other.entry.position, other.entry.rotationY);
          if (overlaps(a, b, 0.05) && Math.abs(a.minY - b.minY) < 0.5) {
            findings.push({
              objectId: part.id,
              subject: code,
              category: "composition",
              severity: "medium",
              message: `${part.id} duplicates ${otherPart.id} on the shared edge.`,
              footprint: footprintOf(intersectArea(a, b) ?? a),
              suggestion: "Adjacent plots should share one boundary line; space the centres so the walls abut instead of overlapping.",
              confirmed: true,
            });
          }
        }
      }
    }

    // Furniture must rest on its deck.
    const deck = classified.find(({ part }) => part.id.endsWith("/pool/deck"));
    if (deck) {
      for (const { part, bounds } of classified) {
        if (part.group !== "furniture") continue;
        const outside = !(
          bounds.minX >= deck.bounds.minX - 0.05 &&
          bounds.maxX <= deck.bounds.maxX + 0.05 &&
          bounds.minZ >= deck.bounds.minZ - 0.05 &&
          bounds.maxZ <= deck.bounds.maxZ + 0.05
        );
        // Canopies may overhang the deck as long as they clear the wall tops.
        const isCanopy = part.id.includes("parasol-canopy");
        if (outside && !isCanopy) {
          findings.push({
            objectId: part.id,
            subject: code,
            category: "clearance",
            severity: "medium",
            message: `${part.id} sits outside the pool deck.`,
            footprint: footprintOf(bounds),
            suggestion: "Place pool furniture relative to the deck rectangle, not the water rectangle.",
            confirmed: true,
          });
        }
      }
    }

    if (!garage) {
      const spread = plot.interior.maxZ - plot.interior.minZ;
      if (spread > 6) {
        findings.push({
          objectId: `${code}/carport`,
          subject: code,
          category: "composition",
          severity: "low",
          message: `${code} has no parking bay despite a ${spread.toFixed(1)} m frontage.`,
          suggestion: "Check frontGap against the kerb; every plot should reach garageFor().",
          confirmed: true,
        });
      }
    }

    // Pool must not collide with its own boundary walls.
    if (pool) {
      for (const { part, bounds } of classified) {
        if (part.group !== "pool" && part.group !== "deck") continue;
        for (const { part: wallPart, bounds: wallBounds } of classified) {
          if (wallPart.group !== "boundary") continue;
          if (overlaps(bounds, wallBounds) && bounds.maxY > wallBounds.minY) {
            findings.push({
              objectId: part.id,
              subject: code,
              category: "clearance",
              severity: "high",
              message: `${part.id} collides with ${wallPart.id}.`,
              footprint: footprintOf(intersectArea(bounds, wallBounds) ?? bounds),
              suggestion: "Size the pool deck from the garden width: deck ≤ sideMargin + (garden width - water width) / 2.",
              confirmed: true,
            });
          }
        }
      }
    }
  }

  /* ── Sports park ───────────────────────────────────────────────────── */
  for (let i = 0; i < COURTS.length; i += 1) {
    const court = COURTS[i]!;
    const rect = courtBounds(court);
    if (!insideFence(rect)) {
      findings.push({
        objectId: `sports/${court.kind}`,
        subject: "sports",
        category: "boundary",
        severity: "critical",
        message: `${court.name} crosses the perimeter fence.`,
        footprint: footprintOf(rect),
        suggestion: "Keep courts inside GARDEN_BOUNDS with their run-off.",
        confirmed: true,
      });
    }
    for (const entry of entries) {
      if (overlaps(rect, houses.get(entry.property.code)!)) {
        findings.push({
          objectId: `sports/${court.kind}`,
          subject: "sports",
          category: "overlap",
          severity: "critical",
          message: `${court.name} overlaps ${entry.property.code}.`,
          footprint: footprintOf(intersectArea(rect, houses.get(entry.property.code)!) ?? rect),
          suggestion: "The sports park occupies the west band; houses must stay east of SITE.ring.outer.minX.",
          confirmed: true,
        });
      }
    }
    for (let j = i + 1; j < COURTS.length; j += 1) {
      const other = courtBounds(COURTS[j]!);
      if (overlaps(rect, other)) {
        findings.push({
          objectId: `sports/${court.kind}`,
          subject: "sports",
          category: "overlap",
          severity: "critical",
          message: `${court.name} overlaps ${COURTS[j]!.name}.`,
          footprint: footprintOf(intersectArea(rect, other) ?? rect),
          suggestion: "Stack the courts along Z with at least 2 m between fence lines.",
          confirmed: true,
        });
      }
    }
  }
  const clubhouse = rectOf(
    CLUBHOUSE.x - CLUBHOUSE.width / 2,
    CLUBHOUSE.z - CLUBHOUSE.depth / 2,
    CLUBHOUSE.x + CLUBHOUSE.width / 2,
    CLUBHOUSE.z + CLUBHOUSE.depth / 2,
  );
  for (const court of COURTS) {
    if (overlaps(clubhouse, courtBounds(court))) {
      findings.push({
        objectId: "sports/clubhouse",
        subject: "sports",
        category: "overlap",
        severity: "high",
        message: `Clubhouse overlaps ${court.name}.`,
        footprint: footprintOf(clubhouse),
        suggestion: "Leave the space between the last court and the fence for the pavilion and its parking.",
        confirmed: true,
      });
    }
  }

  /* ── Lagoon ────────────────────────────────────────────────────────── */
  const lagoonOuter = rectOf(
    SITE.lagoon.x - SITE.lagoon.radiusX - SITE.lagoon.deck,
    SITE.lagoon.z - SITE.lagoon.radiusZ - SITE.lagoon.deck,
    SITE.lagoon.x + SITE.lagoon.radiusX + SITE.lagoon.deck,
    SITE.lagoon.z + SITE.lagoon.radiusZ + SITE.lagoon.deck,
  );
  for (const entry of entries) {
    if (overlaps(lagoonOuter, houses.get(entry.property.code)!)) {
      findings.push({
        objectId: "lagoon",
        subject: "lagoon",
        category: "overlap",
        severity: "critical",
        message: `Lagoon deck overlaps ${entry.property.code}.`,
        footprint: footprintOf(lagoonOuter),
        suggestion: "The lagoon occupies the centre of the circuit; houses sit outside it.",
        confirmed: true,
      });
    }
  }
  {
    const pavilion = rectOf(
      SITE.pavilion.x - SITE.pavilion.width / 2,
      SITE.pavilion.z - SITE.pavilion.depth / 2,
      SITE.pavilion.x + SITE.pavilion.width / 2,
      SITE.pavilion.z + SITE.pavilion.depth / 2,
    );
    const water = rectOf(
      SITE.lagoon.x - SITE.lagoon.radiusX,
      SITE.lagoon.z - SITE.lagoon.radiusZ,
      SITE.lagoon.x + SITE.lagoon.radiusX,
      SITE.lagoon.z + SITE.lagoon.radiusZ,
    );
    if (overlaps(pavilion, water)) {
      findings.push({
        objectId: "lagoon/pavilion",
        subject: "lagoon",
        category: "clearance",
        severity: "high",
        message: "Pavilion stands in the water.",
        footprint: footprintOf(intersectArea(pavilion, water) ?? pavilion),
        suggestion: "Place the pavilion on the deck ring, north of the basin.",
        confirmed: true,
      });
    }
    const onDeck =
      pavilion.minX >= lagoonOuter.minX &&
      pavilion.maxX <= lagoonOuter.maxX &&
      pavilion.minZ >= lagoonOuter.minZ &&
      pavilion.maxZ <= lagoonOuter.maxZ;
    if (!onDeck) {
      findings.push({
        objectId: "lagoon/pavilion",
        subject: "lagoon",
        category: "grounding",
        severity: "medium",
        message: "Pavilion is not fully supported by the lagoon deck.",
        footprint: footprintOf(pavilion),
        suggestion: "Keep the pavilion inside radiusZ + deck, or extend the deck locally.",
        confirmed: true,
      });
    }
  }

  /* ── Vegetation ────────────────────────────────────────────────────── */
  let treeCount = 0;
  let flowerCount = 0;
  if (vegetation) {
    const houses_for_scatter = entries.map((entry) => ({
      position: entry.position,
      typology: entry.property.typology,
      rotationY: entry.rotationY,
    }));
    const keepOut = plots.flatMap((plot) => {
      if (!plot.pool) return [];
      const { pool } = plot;
      const rad = (plot.entry.rotationY * Math.PI) / 180;
      return [
        {
          x: plot.entry.position.x + pool.x * Math.cos(rad) + pool.z * Math.sin(rad),
          z: plot.entry.position.z - pool.x * Math.sin(rad) + pool.z * Math.cos(rad),
          radius: Math.max(pool.width, pool.depth) / 2 + 1.8,
        },
      ];
    });
    // Scatter with the same exclusion list the renderer uses: private plot
    // footprints. Without it the validator would report plants that the scene
    // never places — and, worse, would pass a scene that did place them.
    const plotRects = plots.map((plot) => plot.footprint);
    const trees = scatterTrees({
      houses: houses_for_scatter,
      count: lowQuality ? 54 : 96,
      keepOut: [...keepOut, ...sportsKeepOut()],
      exclude: plotRects,
    });
    const flowers = scatterFlowers(4242, plotRects);
    const shrubs = scatterShrubs(houses_for_scatter, 913, plotRects);
    treeCount = trees.length;
    flowerCount = flowers.length;

    const vegetationPoints = [
      ...trees.map((tree) => ({ id: `tree@${tree.x},${tree.z}`, x: tree.x, z: tree.z, radius: 1.4 })),
      ...shrubs.map((shrub) => ({ id: `shrub@${shrub.x},${shrub.z}`, x: shrub.x, z: shrub.z, radius: 0.7 })),
      ...flowers.map((flower) => ({ id: `flower@${flower.x},${flower.z}`, x: flower.x, z: flower.z, radius: 0.3 })),
    ];

    for (const point of vegetationPoints) {
      const box = rectOf(point.x - point.radius, point.z - point.radius, point.x + point.radius, point.z + point.radius);
      if (pointOnRoad(point.x, point.z, 0)) {
        findings.push({
          objectId: point.id,
          subject: "landscape",
          category: "circulation",
          severity: "high",
          message: `${point.id} stands on a carriageway.`,
          footprint: footprintOf(box),
          suggestion: "Planting beds must keep 2.4 m from the kerb; scatter must reject road points.",
          confirmed: true,
        });
      }
      for (const plot of plots) {
        if (!overlaps(box, plot.interior)) continue;
        findings.push({
          objectId: point.id,
          subject: plot.entry.property.code,
          category: "clearance",
          severity: "high",
          message: `${point.id} grows inside ${plot.entry.property.code}'s private plot.`,
          footprint: footprintOf(box),
          suggestion: "Private plots are excluded from the beds; keep planting outside plot interiors.",
          confirmed: true,
        });
        break;
      }
      for (const court of COURTS) {
        if (overlaps(box, courtBounds(court))) {
          findings.push({
            objectId: point.id,
            subject: "sports",
            category: "clearance",
            severity: "high",
            message: `${point.id} grows on ${court.name}.`,
            footprint: footprintOf(box),
            suggestion: "Add the court run-off to sportsKeepOut() before scattering.",
            confirmed: true,
          });
          break;
        }
      }
      if (overlaps(box, lagoonOuter)) {
        findings.push({
          objectId: point.id,
          subject: "lagoon",
          category: "clearance",
          severity: "medium",
          message: `${point.id} grows on the lagoon deck.`,
          footprint: footprintOf(box),
          suggestion: "Keep the deck clear: exclude the lagoon from the beds.",
          confirmed: true,
        });
      }
    }
  }

  /* ── Street lighting ──────────────────────────────────────────────── */
  for (const lamp of lampPositions(plots.map((plot) => plot.footprint))) {
    if (pointOnRoad(lamp.x, lamp.z, -0.5)) {
      findings.push({
        objectId: `lamp@${lamp.x},${lamp.z}`,
        subject: "landscape",
        category: "composition",
        severity: "low",
        message: "Street lamp stands on the carriageway.",
        footprint: footprintOf(rectOf(lamp.x - 0.3, lamp.z - 0.3, lamp.x + 0.3, lamp.z + 0.3)),
        suggestion: "Offset lamps 2.6 m outside the kerb line.",
        confirmed: true,
      });
    }
    for (const plot of plots) {
      if (overlaps(rectOf(lamp.x - 0.3, lamp.z - 0.3, lamp.x + 0.3, lamp.z + 0.3), plot.interior)) {
        findings.push({
          objectId: `lamp@${lamp.x},${lamp.z}`,
          subject: plot.entry.property.code,
          category: "composition",
          severity: "low",
          message: "Street lamp stands inside a private plot.",
          suggestion: "Lamps belong on the public kerb line only.",
          confirmed: true,
        });
      }
    }
  }

  /* ── Driveways ────────────────────────────────────────────────────────
   * A plot is only serviced if a car can drive from the kerb to its parking
   * bay. `drivewayFor` walks the same ray the renderer draws, so this checks
   * the geometry rather than assuming the layout was right.
   */
  for (const plot of plots) {
    const code = plot.entry.property.code;
    const lateral = plot.garage?.x ?? 0;
    const driveway = drivewayFor(plot.entry.position, plot.entry.property.typology, plot.entry.rotationY, lateral);
    if (!driveway) {
      findings.push({
        objectId: `${code}/driveway`,
        subject: code,
        category: "circulation",
        severity: "critical",
        message: `${code} cannot reach a carriageway within 30 m.`,
        footprint: footprintOf(houseRect(plot.entry)),
        suggestion: "Rotate the plot toward its road frontage or move it within 30 m of the kerb.",
        confirmed: true,
      });
      continue;
    }
    if (driveway.length > MAX_DRIVEWAY) {
      findings.push({
        objectId: `${code}/driveway`,
        subject: code,
        category: "circulation",
        severity: "medium",
        message: `${code} driveway is ${driveway.length.toFixed(1)} m long (limit ${MAX_DRIVEWAY} m).`,
        footprint: { x: driveway.x, z: driveway.z, width: driveway.width, depth: driveway.length },
        suggestion: "Pull the house closer to the kerb, or widen the parking bay so it opens directly onto the road.",
        confirmed: true,
      });
    }
    // The driveway ribbon must not cut through a neighbour.
    for (const other of entries) {
      if (other.property.code === code) continue;
      const otherHouse = houses.get(other.property.code)!;
      const band = drivewayBounds(driveway);
      if (overlaps(band, otherHouse, 0.05)) {
        findings.push({
          objectId: `${code}/driveway`,
          subject: code,
          category: "overlap",
          severity: "high",
          message: `${code} driveway crosses ${other.property.code}.`,
          footprint: footprintOf(intersectArea(band, otherHouse) ?? band),
          suggestion: "Park beside the entrance facing the road the plot fronts, not across a neighbour's frontage.",
          confirmed: true,
        });
      }
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.objectId.localeCompare(b.objectId));

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  return {
    findings,
    counts,
    ok: counts.critical === 0,
    checked: {
      houses: entries.length,
      plots: plots.length,
      pools: poolCount,
      carports: carportCount,
      parts: partCount,
      trees: treeCount,
      flowers: flowerCount,
      plotDrawCalls,
      plotTriangles,
    },
  };
}

/** Human-readable report, used by the audit script and by tests on failure. */
export function formatReport(report: SceneReport): string {
  const lines = [
    `scene: ${report.checked.houses} houses · ${report.checked.plots} plots · ${report.checked.pools} pools · ${report.checked.carports} carports · ${report.checked.parts} parts`,
    `findings: ${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium, ${report.counts.low} low`,
    `budget: plots ${report.checked.plotDrawCalls} draw calls (${(report.checked.plotDrawCalls / Math.max(1, report.checked.plots)).toFixed(1)}/plot) · ${report.checked.plotTriangles.toLocaleString("en-US")} triangles · ${report.checked.trees} trees · ${report.checked.flowers} flowers`,
  ];
  for (const finding of report.findings) {
    const where = finding.footprint
      ? ` @ (${finding.footprint.x.toFixed(1)}, ${finding.footprint.z.toFixed(1)}) ${finding.footprint.width.toFixed(1)}×${finding.footprint.depth.toFixed(1)} m`
      : "";
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.objectId} — ${finding.message}${where} → ${finding.suggestion}`);
  }
  return lines.join("\n");
}

export type { GarageSpec, PoolSpec };
