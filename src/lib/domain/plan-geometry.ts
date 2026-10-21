import type { FloorPlan, OpeningType, PlanOpening } from "./floorplans";

/**
 * Pure geometry derivation shared by the 2D plan renderer and the 3D interior.
 * No Three.js imports — this module is unit-testable in Node.
 */

export interface WallComponent {
  start: number;
  end: number;
  bottom: number;
  top: number;
}

export interface WallSegment {
  id: string;
  orientation: "h" | "v";
  /** z for horizontal walls, x for vertical walls. */
  at: number;
  start: number;
  end: number;
  thickness: number;
  exterior: boolean;
  components: WallComponent[];
}

export interface OpeningCut {
  id: string;
  orientation: "h" | "v";
  at: number;
  start: number;
  end: number;
  bottom: number;
  top: number;
  type: OpeningType;
  glass: boolean;
}

/** Vertical extents (metres) used by both renderers. */
export function openingExtents(type: OpeningType, wallHeight: number): { bottom: number; top: number } {
  switch (type) {
    case "door":
      return { bottom: 0, top: 2.15 };
    case "arch":
      return { bottom: 0, top: 2.5 };
    case "slider":
      return { bottom: 0, top: 2.55 };
    case "window":
      return { bottom: 0.95, top: 2.35 };
  }
}

const EPS = 0.001;
const key = (orientation: "h" | "v", at: number) => `${orientation}:${at.toFixed(3)}`;

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [[sorted[0]![0], sorted[0]![1]]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current[0] <= last[1] + 0.0001) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push([current[0], current[1]]);
    }
  }
  return merged;
}

/** Remove openings that are not actually on this wall span. */
export function openingsForWall(plan: FloorPlan, wall: { orientation: "h" | "v"; at: number; start: number; end: number }): PlanOpening[] {
  return plan.openings
    .filter((o) => o.orientation === wall.orientation && Math.abs(o.at - wall.at) < EPS)
    .filter((o) => o.center + o.width / 2 > wall.start && o.center - o.width / 2 < wall.end)
    .sort((a, b) => a.center - b.center);
}

/**
 * Derive a deduplicated wall network from room rectangles.
 * Collinear overlapping edges are merged; openings are carved into the
 * resulting solids so that doors and windows are genuine holes.
 */
export function deriveWalls(plan: FloorPlan): WallSegment[] {
  const minX = Math.min(...plan.rooms.map((r) => r.x1));
  const maxX = Math.max(...plan.rooms.map((r) => r.x2));
  const minZ = Math.min(...plan.rooms.map((r) => r.z1));
  const maxZ = Math.max(...plan.rooms.map((r) => r.z2));

  type Group = { orientation: "h" | "v"; at: number; intervals: Array<[number, number]> };
  const groups = new Map<string, Group>();

  const push = (orientation: "h" | "v", at: number, a: number, b: number) => {
    const k = key(orientation, at);
    const existing = groups.get(k);
    if (existing) existing.intervals.push([Math.min(a, b), Math.max(a, b)]);
    else groups.set(k, { orientation, at, intervals: [[Math.min(a, b), Math.max(a, b)]] });
  };

  for (const room of plan.rooms) {
    push("h", room.z1, room.x1, room.x2);
    push("h", room.z2, room.x1, room.x2);
    push("v", room.x1, room.z1, room.z2);
    push("v", room.x2, room.z1, room.z2);
  }

  const walls: WallSegment[] = [];
  const sortedGroups = [...groups.values()].sort((a, b) => (a.orientation === b.orientation ? a.at - b.at : a.orientation.localeCompare(b.orientation)));

  for (const group of sortedGroups) {
    const onBoundary =
      group.orientation === "h"
        ? Math.abs(group.at - minZ) < EPS || Math.abs(group.at - maxZ) < EPS
        : Math.abs(group.at - minX) < EPS || Math.abs(group.at - maxX) < EPS;
    const thickness = onBoundary ? plan.exteriorWallThickness : plan.interiorWallThickness;
    const spans = mergeIntervals(group.intervals);

    spans.forEach(([start, end], index) => {
      if (end - start < 0.05) return;
      const wall = {
        orientation: group.orientation,
        at: group.at,
        start,
        end,
        thickness,
        exterior: onBoundary,
      };
      const openings = openingsForWall(plan, wall);
      const components: WallComponent[] = [];
      let cursor = start;

      for (const opening of openings) {
        const ext = openingExtents(opening.type, plan.wallHeightM);
        const oStart = Math.max(start, opening.center - opening.width / 2);
        const oEnd = Math.min(end, opening.center + opening.width / 2);
        if (oEnd <= cursor) continue;
        if (oStart > cursor + 0.01) {
          components.push({ start: cursor, end: oStart, bottom: 0, top: plan.wallHeightM });
        }
        if (ext.bottom > 0.01) {
          components.push({ start: oStart, end: oEnd, bottom: 0, top: ext.bottom });
        }
        if (ext.top < plan.wallHeightM - 0.01) {
          components.push({ start: oStart, end: oEnd, bottom: ext.top, top: plan.wallHeightM });
        }
        cursor = Math.max(cursor, oEnd);
      }
      if (cursor < end - 0.01) {
        components.push({ start: cursor, end, bottom: 0, top: plan.wallHeightM });
      }

      walls.push({
        ...wall,
        id: `${group.orientation}${group.at.toFixed(2)}-${start.toFixed(2)}-${index}`,
        components: components.filter((c) => c.end - c.start > 0.01 && c.top - c.bottom > 0.01),
      });
    });
  }

  return walls;
}

/** Locate the opening cuts (used for glass panes, frames and plan symbols). */
export function deriveOpenings(plan: FloorPlan): OpeningCut[] {
  return plan.openings.map((opening) => {
    const ext = openingExtents(opening.type, plan.wallHeightM);
    return {
      id: opening.id,
      orientation: opening.orientation,
      at: opening.at,
      start: opening.center - opening.width / 2,
      end: opening.center + opening.width / 2,
      bottom: ext.bottom,
      top: ext.top,
      type: opening.type,
      glass: opening.type === "window" || opening.type === "slider",
    };
  });
}

export function planBounds(plan: FloorPlan) {
  return {
    minX: -plan.widthM / 2,
    maxX: plan.widthM / 2,
    minZ: -plan.depthM / 2,
    maxZ: plan.depthM / 2,
    width: plan.widthM,
    depth: plan.depthM,
  };
}

/** SVG path-friendly description of a room (for hit-testing / labels). */
export function roomArea(room: { x1: number; z1: number; x2: number; z2: number }): number {
  return Math.abs((room.x2 - room.x1) * (room.z2 - room.z1));
}

export interface PlanValidationIssue {
  severity: "error" | "warning";
  message: string;
}

/** Validate a plan specification before it is rendered or published. */
export function validatePlan(plan: FloorPlan): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const bounds = planBounds(plan);

  for (const room of plan.rooms) {
    if (room.x2 <= room.x1 || room.z2 <= room.z1) {
      issues.push({ severity: "error", message: `Room ${room.id} has invalid bounds.` });
    }
    if (room.x1 < bounds.minX - 0.01 || room.x2 > bounds.maxX + 0.01 || room.z1 < bounds.minZ - 0.01 || room.z2 > bounds.maxZ + 0.01) {
      issues.push({ severity: "error", message: `Room ${room.id} exceeds the building footprint.` });
    }
  }

  for (let i = 0; i < plan.rooms.length; i++) {
    for (let j = i + 1; j < plan.rooms.length; j++) {
      const a = plan.rooms[i]!;
      const b = plan.rooms[j]!;
      const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
      const overlapZ = Math.min(a.z2, b.z2) - Math.max(a.z1, b.z1);
      if (overlapX > 0.01 && overlapZ > 0.01) {
        issues.push({ severity: "error", message: `Rooms ${a.id} and ${b.id} overlap.` });
      }
    }
  }

  const walls = deriveWalls(plan);
  for (const opening of plan.openings) {
    const onWall = walls.some(
      (w) =>
        w.orientation === opening.orientation &&
        Math.abs(w.at - opening.at) < EPS &&
        opening.center - opening.width / 2 >= w.start - 0.01 &&
        opening.center + opening.width / 2 <= w.end + 0.01,
    );
    if (!onWall) issues.push({ severity: "error", message: `Opening ${opening.id} is not on a wall.` });
  }

  for (const room of plan.rooms) {
    if (roomArea(room) < 1.2) issues.push({ severity: "warning", message: `Room ${room.id} is very small.` });
  }

  return issues;
}
