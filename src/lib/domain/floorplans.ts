import type { Typology } from "./types";

/**
 * Floor-plan specification.
 *
 * One data source drives:
 *  - the 2D plan drawing (SVG),
 *  - the walkable / dollhouse interior geometry (walls, openings, furniture),
 *  - the unit's gross footprint used by the exterior model.
 *
 * Coordinates are metres on the X/Z plane, centred on the building origin.
 * Walls are *derived* by merging room edges (see lib/3d/plan-geometry.ts),
 * which keeps the specification small and guarantees that rooms tile without
 * duplicated, z-fighting walls.
 *
 * These plans are PROTOTYPES. They are plausible, not architecturally validated.
 */

export type RoomKind =
  | "living"
  | "dining"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "wc"
  | "hall"
  | "corridor"
  | "laundry"
  | "storage"
  | "study"
  | "dressing"
  | "terrace"
  | "garden";

export interface PlanRoom {
  id: string;
  name: string;
  kind: RoomKind;
  /** Inclusive bounds in metres, x1 < x2, z1 < z2. */
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export type OpeningType = "door" | "window" | "slider" | "arch";

export interface PlanOpening {
  id: string;
  /** `h` = wall runs along X at z = at. `v` = wall runs along Z at x = at. */
  orientation: "h" | "v";
  /** Wall coordinate on the perpendicular axis. */
  at: number;
  /** Centre of the opening along the wall. */
  center: number;
  width: number;
  type: OpeningType;
}

export type FurnitureType =
  | "sofa"
  | "sectional"
  | "armchair"
  | "coffeeTable"
  | "rug"
  | "tvConsole"
  | "diningTable"
  | "diningChairs"
  | "kitchenRun"
  | "kitchenIsland"
  | "kitchenTower"
  | "bed"
  | "nightstand"
  | "wardrobe"
  | "desk"
  | "dresser"
  | "bathtub"
  | "shower"
  | "toilet"
  | "vanity"
  | "washer"
  | "shelf"
  | "plant"
  | "floorLamp"
  | "bench"
  | "sideboard"
  | "lounger"
  | "outdoorTable";

export interface FurniturePiece {
  id: string;
  type: FurnitureType;
  /** Centre of the piece. */
  x: number;
  z: number;
  /** Rotation around Y in degrees (0 = front faces +Z). */
  rotation: number;
  width: number;
  depth: number;
  roomId?: string;
}

export interface PlanTerrace {
  id: string;
  name: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  deck: "timber" | "stone" | "lawn";
}

export interface FloorPlan {
  typology: Typology;
  widthM: number;
  depthM: number;
  wallHeightM: number;
  interiorWallThickness: number;
  exteriorWallThickness: number;
  rooms: PlanRoom[];
  openings: PlanOpening[];
  terraces: PlanTerrace[];
  furniture: FurniturePiece[];
  /** Rooms that get a higher ceiling in the prototype (visual only). */
  doubleHeightRoomIds: string[];
  notes: string;
}

const rect = (id: string, name: string, kind: RoomKind, x1: number, z1: number, x2: number, z2: number): PlanRoom => ({
  id,
  name,
  kind,
  x1,
  z1,
  x2,
  z2,
});

export const areaOf = (r: { x1: number; z1: number; x2: number; z2: number }): number =>
  Math.abs((r.x2 - r.x1) * (r.z2 - r.z1));

export const centreOf = (r: { x1: number; z1: number; x2: number; z2: number }) => ({
  x: (r.x1 + r.x2) / 2,
  z: (r.z1 + r.z2) / 2,
});

/* ────────────────────────────────────────────────────────────────────────────
 * T1 — one-bedroom garden house (7.2 × 10.4 m)
 * ──────────────────────────────────────────────────────────────────────────── */
const T1: Omit<FloorPlan, "furniture"> = {
  typology: "T1",
  widthM: 7.2,
  depthM: 10.4,
  wallHeightM: 3.15,
  interiorWallThickness: 0.16,
  exteriorWallThickness: 0.3,
  rooms: [
    rect("living", "Living", "living", -3.6, -5.2, 1.4, -0.6),
    rect("kitchen", "Kitchen", "kitchen", 1.4, -5.2, 3.6, -0.6),
    rect("bath", "Bathroom", "bathroom", -3.6, -0.6, 0.6, 2.0),
    rect("hall", "Entrance hall", "hall", 0.6, -0.6, 3.6, 2.0),
    rect("bedroom", "Bedroom", "bedroom", -3.6, 2.0, 0.6, 5.2),
    rect("dressing", "Dressing", "dressing", 0.6, 2.0, 1.9, 5.2),
    rect("utility", "Utility", "laundry", 1.9, 2.0, 3.6, 5.2),
  ],
  openings: [
    { id: "t1-living-kitchen", orientation: "v", at: 1.4, center: -3.0, width: 2.4, type: "arch" },
    { id: "t1-living-hall", orientation: "h", at: -0.6, center: 2.2, width: 1.3, type: "arch" },
    { id: "t1-hall-bath", orientation: "v", at: 0.6, center: 0.7, width: 0.85, type: "door" },
    { id: "t1-hall-dressing", orientation: "h", at: 2.0, center: 1.2, width: 0.85, type: "door" },
    { id: "t1-hall-utility", orientation: "h", at: 2.0, center: 2.7, width: 0.8, type: "door" },
    { id: "t1-bed-dressing", orientation: "v", at: 0.6, center: 3.4, width: 0.85, type: "door" },
    { id: "t1-entry", orientation: "v", at: 3.6, center: 0.8, width: 1.05, type: "door" },
    { id: "t1-win-living-n", orientation: "h", at: -5.2, center: -2.0, width: 2.8, type: "slider" },
    { id: "t1-win-living-w", orientation: "v", at: -3.6, center: -3.2, width: 1.6, type: "window" },
    { id: "t1-win-kitchen-n", orientation: "h", at: -5.2, center: 2.5, width: 1.4, type: "window" },
    { id: "t1-win-kitchen-e", orientation: "v", at: 3.6, center: -3.2, width: 1.4, type: "window" },
    { id: "t1-win-bath-w", orientation: "v", at: -3.6, center: 0.7, width: 0.8, type: "window" },
    { id: "t1-win-bed-w", orientation: "v", at: -3.6, center: 3.4, width: 1.6, type: "window" },
    { id: "t1-win-bed-s", orientation: "h", at: 5.2, center: -2.2, width: 2.4, type: "slider" },
    { id: "t1-win-dress-s", orientation: "h", at: 5.2, center: 1.25, width: 0.8, type: "window" },
    { id: "t1-win-util-s", orientation: "h", at: 5.2, center: 2.75, width: 0.8, type: "window" },
  ],
  terraces: [
    { id: "t1-terrace", name: "Private garden terrace", x1: -3.9, z1: 5.2, x2: 0.9, z2: 7.6, deck: "timber" },
    { id: "t1-entry-path", name: "Entrance", x1: 3.6, z1: -0.2, x2: 5.4, z2: 1.8, deck: "stone" },
  ],
  doubleHeightRoomIds: [],
  notes: "Compact garden house. Single level, south-facing bedroom terrace.",
};

/* ────────────────────────────────────────────────────────────────────────────
 * T2 — two-bedroom house (9.0 × 11.0 m)
 * ──────────────────────────────────────────────────────────────────────────── */
const T2: Omit<FloorPlan, "furniture"> = {
  typology: "T2",
  widthM: 9.0,
  depthM: 11.0,
  wallHeightM: 3.15,
  interiorWallThickness: 0.16,
  exteriorWallThickness: 0.3,
  rooms: [
    rect("living", "Living", "living", -4.5, -5.5, 0.9, -0.9),
    rect("kitchen", "Kitchen & dining", "kitchen", 0.9, -5.5, 4.5, -0.9),
    rect("corridor", "Hall", "corridor", -0.9, -0.9, 0.9, 5.5),
    rect("study", "Study", "study", -4.5, -0.9, -0.9, 0.9),
    rect("wc", "Guest WC", "wc", 0.9, -0.9, 2.4, 0.9),
    rect("utility", "Laundry", "laundry", 2.4, -0.9, 4.5, 0.9),
    rect("master", "Master bedroom", "bedroom", -4.5, 0.9, -0.9, 4.0),
    rect("ensuite", "Ensuite", "bathroom", -4.5, 4.0, -2.6, 5.5),
    rect("walkin", "Walk-in wardrobe", "dressing", -2.6, 4.0, -0.9, 5.5),
    rect("bedroom2", "Bedroom 2", "bedroom", 0.9, 0.9, 4.5, 4.0),
    rect("bath2", "Bathroom 2", "bathroom", 0.9, 4.0, 2.7, 5.5),
    rect("storage", "Store", "storage", 2.7, 4.0, 4.5, 5.5),
  ],
  openings: [
    { id: "t2-living-kitchen", orientation: "v", at: 0.9, center: -3.2, width: 2.6, type: "arch" },
    { id: "t2-living-hall", orientation: "h", at: -0.9, center: -2.5, width: 1.6, type: "arch" },
    { id: "t2-study-hall", orientation: "v", at: -0.9, center: 0.0, width: 0.9, type: "door" },
    { id: "t2-wc-hall", orientation: "v", at: 0.9, center: 0.0, width: 0.8, type: "door" },
    { id: "t2-master-hall", orientation: "v", at: -0.9, center: 2.4, width: 0.9, type: "door" },
    { id: "t2-bed2-hall", orientation: "v", at: 0.9, center: 2.4, width: 0.9, type: "door" },
    { id: "t2-ensuite-master", orientation: "h", at: 4.0, center: -3.5, width: 0.8, type: "door" },
    { id: "t2-walkin-master", orientation: "h", at: 4.0, center: -1.8, width: 0.8, type: "door" },
    { id: "t2-bath2-bed2", orientation: "h", at: 4.0, center: 1.8, width: 0.7, type: "door" },
    { id: "t2-store-bed2", orientation: "h", at: 4.0, center: 3.6, width: 0.7, type: "door" },
    { id: "t2-entry", orientation: "h", at: 5.5, center: 0, width: 1.05, type: "door" },
    { id: "t2-win-living", orientation: "h", at: -5.5, center: -2.4, width: 3.0, type: "slider" },
    { id: "t2-win-kitchen", orientation: "h", at: -5.5, center: 2.7, width: 2.0, type: "window" },
    { id: "t2-win-living-w", orientation: "v", at: -4.5, center: -3.4, width: 1.8, type: "window" },
    { id: "t2-win-master-w", orientation: "v", at: -4.5, center: 2.4, width: 1.6, type: "window" },
    { id: "t2-win-kitchen-e", orientation: "v", at: 4.5, center: -3.4, width: 1.4, type: "window" },
    { id: "t2-win-bed2-e", orientation: "v", at: 4.5, center: 2.4, width: 1.4, type: "window" },
    { id: "t2-win-ensuite", orientation: "h", at: 5.5, center: -3.5, width: 0.9, type: "window" },
    { id: "t2-win-walkin", orientation: "h", at: 5.5, center: -1.7, width: 0.8, type: "window" },
    { id: "t2-win-bath2", orientation: "h", at: 5.5, center: 1.8, width: 0.8, type: "window" },
    { id: "t2-win-store", orientation: "h", at: 5.5, center: 3.6, width: 0.8, type: "window" },
  ],
  terraces: [
    { id: "t2-rear-terrace", name: "Garden terrace", x1: -4.8, z1: -7.4, x2: 1.2, z2: -5.5, deck: "stone" },
    { id: "t2-front-terrace", name: "Master terrace", x1: -4.8, z1: 5.5, x2: -0.6, z2: 7.0, deck: "timber" },
    { id: "t2-entry-path", name: "Entrance", x1: -1.2, z1: 5.5, x2: 1.2, z2: 8.4, deck: "stone" },
  ],
  doubleHeightRoomIds: [],
  notes: "Open-plan social area, study, two bedrooms and a private master terrace.",
};

/* ────────────────────────────────────────────────────────────────────────────
 * T3 — three-bedroom family house (11.0 × 12.4 m)
 * ──────────────────────────────────────────────────────────────────────────── */
const T3: Omit<FloorPlan, "furniture"> = {
  typology: "T3",
  widthM: 11.0,
  depthM: 12.4,
  wallHeightM: 3.3,
  interiorWallThickness: 0.16,
  exteriorWallThickness: 0.3,
  rooms: [
    rect("living", "Living", "living", -5.5, -6.2, 0.6, -1.2),
    rect("kitchen", "Kitchen & dining", "kitchen", 0.6, -6.2, 5.5, -1.2),
    rect("corridor", "Hall", "corridor", -1.0, -1.2, 1.0, 6.2),
    rect("study", "Study", "study", -5.5, -1.2, -1.0, 1.6),
    rect("wc", "Guest WC", "wc", 1.0, -1.2, 3.8, 1.6),
    rect("laundry", "Laundry", "laundry", 3.8, -1.2, 5.5, 1.6),
    rect("master", "Master bedroom", "bedroom", -5.5, 1.6, -1.0, 4.4),
    rect("ensuite", "Ensuite", "bathroom", -5.5, 4.4, -1.0, 6.2),
    rect("bedroom2", "Bedroom 2", "bedroom", 1.0, 1.6, 5.5, 4.0),
    rect("bedroom3", "Bedroom 3", "bedroom", 1.0, 4.0, 3.2, 6.2),
    rect("bath2", "Bathroom 2", "bathroom", 3.2, 4.0, 5.5, 6.2),
  ],
  openings: [
    { id: "t3-living-kitchen", orientation: "v", at: 0.6, center: -3.6, width: 2.8, type: "arch" },
    { id: "t3-living-hall", orientation: "h", at: -1.2, center: -2.4, width: 1.6, type: "arch" },
    { id: "t3-study-hall", orientation: "v", at: -1.0, center: 0.2, width: 0.9, type: "door" },
    { id: "t3-wc-hall", orientation: "v", at: 1.0, center: 0.2, width: 0.8, type: "door" },
    { id: "t3-laundry-kitchen", orientation: "h", at: -1.2, center: 4.6, width: 0.9, type: "door" },
    { id: "t3-master-hall", orientation: "v", at: -1.0, center: 2.8, width: 0.9, type: "door" },
    { id: "t3-ensuite-master", orientation: "h", at: 4.4, center: -4.4, width: 0.8, type: "door" },
    { id: "t3-bed2-hall", orientation: "v", at: 1.0, center: 2.8, width: 0.9, type: "door" },
    { id: "t3-bed3-bed2", orientation: "h", at: 4.0, center: 2.0, width: 0.8, type: "door" },
    { id: "t3-bath2-bed2", orientation: "h", at: 4.0, center: 4.4, width: 0.7, type: "door" },
    { id: "t3-entry", orientation: "h", at: 6.2, center: 0, width: 1.05, type: "door" },
    { id: "t3-win-living", orientation: "h", at: -6.2, center: -2.8, width: 3.4, type: "slider" },
    { id: "t3-win-kitchen-n", orientation: "h", at: -6.2, center: 2.2, width: 2.4, type: "slider" },
    { id: "t3-win-kitchen-ne", orientation: "h", at: -6.2, center: 4.8, width: 1.2, type: "window" },
    { id: "t3-win-living-w", orientation: "v", at: -5.5, center: -3.8, width: 1.8, type: "window" },
    { id: "t3-win-study", orientation: "v", at: -5.5, center: 0.2, width: 1.4, type: "window" },
    { id: "t3-win-master", orientation: "v", at: -5.5, center: 3.0, width: 1.6, type: "window" },
    { id: "t3-win-kitchen-e", orientation: "v", at: 5.5, center: -3.6, width: 1.4, type: "window" },
    { id: "t3-win-laundry", orientation: "v", at: 5.5, center: 0.2, width: 1.0, type: "window" },
    { id: "t3-win-bed2", orientation: "v", at: 5.5, center: 2.8, width: 1.4, type: "window" },
    { id: "t3-win-ensuite", orientation: "h", at: 6.2, center: -4.0, width: 1.0, type: "window" },
    { id: "t3-win-bed3", orientation: "h", at: 6.2, center: 2.0, width: 1.8, type: "slider" },
    { id: "t3-win-bath2", orientation: "h", at: 6.2, center: 4.4, width: 0.9, type: "window" },
  ],
  terraces: [
    { id: "t3-rear-terrace", name: "Main terrace", x1: -5.8, z1: -8.6, x2: 5.8, z2: -6.2, deck: "stone" },
    { id: "t3-garden-terrace", name: "Bedroom garden", x1: 0.8, z1: 6.2, x2: 3.4, z2: 8.4, deck: "timber" },
    { id: "t3-entry-path", name: "Entrance", x1: -1.3, z1: 6.2, x2: 1.3, z2: 9.2, deck: "stone" },
  ],
  doubleHeightRoomIds: [],
  notes: "Family house with open kitchen-dining, three bedrooms and a full-width rear terrace.",
};

/* ────────────────────────────────────────────────────────────────────────────
 * T4 — four-bedroom signature house (12.6 × 13.6 m)
 * ──────────────────────────────────────────────────────────────────────────── */
const T4: Omit<FloorPlan, "furniture"> = {
  typology: "T4",
  widthM: 12.6,
  depthM: 13.6,
  wallHeightM: 3.4,
  interiorWallThickness: 0.18,
  exteriorWallThickness: 0.32,
  rooms: [
    rect("living", "Living", "living", -6.3, -6.8, 0.2, -0.8),
    rect("kitchen", "Kitchen & dining", "kitchen", 0.2, -6.8, 6.3, -0.8),
    rect("corridor", "Gallery hall", "corridor", -1.1, -0.8, 1.1, 6.8),
    rect("study", "Study", "study", -6.3, -0.8, -1.1, 2.0),
    rect("wc", "Guest WC", "wc", 1.1, -0.8, 2.5, 1.4),
    rect("laundry", "Laundry", "laundry", 2.5, -0.8, 4.0, 1.4),
    rect("pantry", "Pantry", "storage", 4.0, -0.8, 6.3, 1.4),
    rect("master", "Master suite", "bedroom", -6.3, 2.0, -1.1, 4.6),
    rect("ensuite", "Ensuite", "bathroom", -6.3, 4.6, -3.8, 6.8),
    rect("dressing", "Dressing", "dressing", -3.8, 4.6, -1.1, 6.8),
    rect("bedroom2", "Bedroom 2", "bedroom", 1.1, 1.4, 4.0, 4.2),
    rect("bedroom3", "Bedroom 3", "bedroom", 4.0, 1.4, 6.3, 4.2),
    rect("bedroom4", "Bedroom 4", "bedroom", 1.1, 4.2, 3.1, 6.8),
    rect("bath2", "Bathroom 2", "bathroom", 3.1, 4.2, 5.0, 6.8),
    rect("storage", "Store", "storage", 5.0, 4.2, 6.3, 6.8),
  ],
  openings: [
    { id: "t4-living-kitchen", orientation: "v", at: 0.2, center: -4.0, width: 3.2, type: "arch" },
    { id: "t4-living-hall", orientation: "h", at: -0.8, center: -2.6, width: 1.8, type: "arch" },
    { id: "t4-study-hall", orientation: "v", at: -1.1, center: 0.4, width: 1.0, type: "door" },
    { id: "t4-wc-hall", orientation: "v", at: 1.1, center: 0.3, width: 0.8, type: "door" },
    { id: "t4-laundry-kitchen", orientation: "h", at: -0.8, center: 3.2, width: 0.9, type: "door" },
    { id: "t4-pantry-kitchen", orientation: "h", at: -0.8, center: 5.4, width: 0.9, type: "door" },
    { id: "t4-master-hall", orientation: "v", at: -1.1, center: 3.0, width: 1.0, type: "door" },
    { id: "t4-ensuite-master", orientation: "h", at: 4.6, center: -5.0, width: 0.8, type: "door" },
    { id: "t4-dressing-master", orientation: "h", at: 4.6, center: -2.4, width: 0.9, type: "door" },
    { id: "t4-bed2-hall", orientation: "v", at: 1.1, center: 2.4, width: 0.9, type: "door" },
    { id: "t4-bed3-bed2", orientation: "v", at: 4.0, center: 2.4, width: 0.8, type: "door" },
    { id: "t4-bed4-bed2", orientation: "h", at: 4.2, center: 2.0, width: 0.8, type: "door" },
    { id: "t4-bath2-bed4", orientation: "v", at: 3.1, center: 5.4, width: 0.7, type: "door" },
    { id: "t4-store-bed3", orientation: "h", at: 4.2, center: 5.6, width: 0.7, type: "door" },
    { id: "t4-entry", orientation: "h", at: 6.8, center: 0, width: 1.1, type: "door" },
    { id: "t4-win-living", orientation: "h", at: -6.8, center: -3.2, width: 4.0, type: "slider" },
    { id: "t4-win-kitchen-n", orientation: "h", at: -6.8, center: 2.0, width: 2.6, type: "slider" },
    { id: "t4-win-kitchen-ne", orientation: "h", at: -6.8, center: 5.2, width: 1.4, type: "window" },
    { id: "t4-win-living-w", orientation: "v", at: -6.3, center: -4.0, width: 2.0, type: "window" },
    { id: "t4-win-study", orientation: "v", at: -6.3, center: 0.4, width: 1.6, type: "window" },
    { id: "t4-win-master", orientation: "v", at: -6.3, center: 3.2, width: 1.8, type: "window" },
    { id: "t4-win-kitchen-e", orientation: "v", at: 6.3, center: -3.8, width: 1.6, type: "window" },
    { id: "t4-win-bed3", orientation: "v", at: 6.3, center: 3.0, width: 1.6, type: "window" },
    { id: "t4-win-ensuite", orientation: "h", at: 6.8, center: -5.0, width: 1.0, type: "window" },
    { id: "t4-win-dressing", orientation: "h", at: 6.8, center: -2.4, width: 1.0, type: "window" },
    { id: "t4-win-bed4", orientation: "h", at: 6.8, center: 2.1, width: 1.8, type: "slider" },
    { id: "t4-win-bath2", orientation: "h", at: 6.8, center: 4.0, width: 0.9, type: "window" },
    { id: "t4-win-store", orientation: "h", at: 6.8, center: 5.6, width: 0.7, type: "window" },
  ],
  terraces: [
    { id: "t4-rear-terrace", name: "Pool-free garden deck", x1: -6.6, z1: -9.4, x2: 6.6, z2: -6.8, deck: "stone" },
    { id: "t4-garden-terrace", name: "Bedroom garden", x1: 0.9, z1: 6.8, x2: 3.3, z2: 9.0, deck: "timber" },
    { id: "t4-entry-path", name: "Entrance", x1: -1.5, z1: 6.8, x2: 1.5, z2: 10.0, deck: "stone" },
  ],
  doubleHeightRoomIds: ["living"],
  notes:
    "Signature residence prototype: double-height living volume, four bedrooms, service wing. Upper floor not modelled in this milestone.",
};

const BASE_PLANS: Record<Typology, Omit<FloorPlan, "furniture">> = { T1: T1, T2: T2, T3: T3, T4: T4 };

/* ────────────────────────────────────────────────────────────────────────────
 * Furniture generation
 * Furniture is derived from room semantics so that every typology is furnished
 * coherently without hand-placing hundreds of objects. Everything is
 * deterministic.
 * ──────────────────────────────────────────────────────────────────────────── */

let pieceSeq = 0;
const piece = (
  type: FurnitureType,
  x: number,
  z: number,
  rotation: number,
  width: number,
  depth: number,
  roomId: string,
): FurniturePiece => ({
  id: `f${++pieceSeq}`,
  type,
  x: round(x),
  z: round(z),
  rotation,
  width,
  depth,
  roomId,
});

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function furnishRoom(room: PlanRoom): FurniturePiece[] {
  const out: FurniturePiece[] = [];
  const w = room.x2 - room.x1;
  const d = room.z2 - room.z1;
  const { x: cx, z: cz } = centreOf(room);
  const landscape = w >= d;
  // Walls: north (z1), south (z2), west (x1), east (x2)
  const inset = 0.45;

  switch (room.kind) {
    case "living": {
      const sofaW = Math.min(3.2, landscape ? w * 0.62 : d * 0.62);
      if (landscape) {
        out.push(piece("sofa", cx, room.z2 - inset - 0.45, 180, sofaW, 0.95, room.id));
        out.push(piece("coffeeTable", cx, cz + 0.3, 0, Math.min(1.4, sofaW * 0.5), 0.7, room.id));
        out.push(piece("rug", cx, cz + 0.35, 0, Math.min(3.4, w * 0.7), Math.min(2.6, d * 0.55), room.id));
        out.push(piece("tvConsole", cx, room.z1 + 0.3, 0, Math.min(2.2, w * 0.45), 0.42, room.id));
        if (w > 4.6) out.push(piece("armchair", room.x1 + 1.0, cz + 0.6, 90, 0.85, 0.85, room.id));
        out.push(piece("plant", room.x2 - 0.7, room.z1 + 0.7, 0, 0.55, 0.55, room.id));
        out.push(piece("floorLamp", room.x1 + 0.6, room.z2 - 0.7, 0, 0.4, 0.4, room.id));
      } else {
        out.push(piece("sofa", room.x1 + inset + 0.45, cz, 90, sofaW, 0.95, room.id));
        out.push(piece("coffeeTable", cx + 0.3, cz, 0, Math.min(1.4, sofaW * 0.5), 0.7, room.id));
        out.push(piece("rug", cx + 0.35, cz, 0, Math.min(2.6, w * 0.55), Math.min(3.4, d * 0.7), room.id));
        out.push(piece("tvConsole", room.x2 - 0.3, cz, 90, Math.min(2.2, d * 0.45), 0.42, room.id));
        out.push(piece("plant", room.x2 - 0.7, room.z1 + 0.7, 0, 0.55, 0.55, room.id));
      }
      break;
    }
    case "kitchen": {
      // Counter run along the north wall, plus an island when there is room.
      const runW = w - 1.0;
      out.push(piece("kitchenRun", cx, room.z1 + 0.33, 0, runW, 0.65, room.id));
      if (w > 3.6 && d > 3.2) {
        out.push(piece("kitchenIsland", cx - w * 0.08, room.z1 + 2.25, 0, Math.min(2.6, w * 0.5), 0.95, room.id));
        out.push(piece("diningTable", cx + w * 0.22, cz + 1.1, 0, 1.8, 0.95, room.id));
        out.push(piece("diningChairs", cx + w * 0.22, cz + 1.1, 0, 1.8, 1.6, room.id));
      } else {
        out.push(piece("diningTable", cx, room.z2 - 1.1, 0, 1.4, 0.85, room.id));
        out.push(piece("diningChairs", cx, room.z2 - 1.1, 0, 1.4, 1.5, room.id));
      }
      if (w > 4.4) out.push(piece("kitchenTower", room.x2 - 0.45, room.z1 + 0.35, 0, 0.85, 0.7, room.id));
      break;
    }
    case "bedroom": {
      const bedW = w > 3.2 ? 1.75 : 1.5;
      const bedDepth = 2.05;
      const alongX = landscape;
      if (alongX) {
        out.push(piece("bed", cx, room.z1 + 0.35 + bedDepth / 2, 0, bedW, bedDepth, room.id));
        out.push(piece("nightstand", cx - bedW / 2 - 0.3, room.z1 + 0.65, 0, 0.45, 0.4, room.id));
        out.push(piece("nightstand", cx + bedW / 2 + 0.3, room.z1 + 0.65, 0, 0.45, 0.4, room.id));
        out.push(piece("rug", cx, room.z1 + 0.3 + bedDepth + 0.5, 0, bedW + 0.9, 1.5, room.id));
        if (w > 4.2) out.push(piece("wardrobe", room.x2 - 0.35, room.z2 - 1.6, 90, 2.4, 0.62, room.id));
        if (room.kind === "bedroom" && w > 5.4) out.push(piece("dresser", room.x1 + 0.55, room.z2 - 0.7, 90, 1.2, 0.5, room.id));
      } else {
        out.push(piece("bed", room.x1 + 0.35 + bedDepth / 2, cz, 90, bedW, bedDepth, room.id));
        out.push(piece("nightstand", room.x1 + 0.65, cz - bedW / 2 - 0.3, 0, 0.45, 0.4, room.id));
        out.push(piece("nightstand", room.x1 + 0.65, cz + bedW / 2 + 0.3, 0, 0.45, 0.4, room.id));
        out.push(piece("rug", room.x1 + 0.3 + bedDepth + 0.5, cz, 0, 1.5, bedW + 0.9, room.id));
        if (d > 4.2) out.push(piece("wardrobe", room.x2 - 1.6, room.z2 - 0.35, 0, 2.4, 0.62, room.id));
      }
      break;
    }
    case "bathroom": {
      const large = w >= 2.6 && d >= 2.6;
      out.push(piece("vanity", cx, room.z1 + 0.28, 180, Math.min(1.8, w * 0.7), 0.55, room.id));
      if (large) {
        out.push(piece("bathtub", room.x1 + 0.95, room.z2 - 0.95, 0, 1.7, 0.8, room.id));
        out.push(piece("shower", room.x2 - 0.75, room.z2 - 0.85, 0, 1.1, 1.1, room.id));
        out.push(piece("toilet", room.x2 - 0.45, room.z1 + 1.3, 270, 0.42, 0.62, room.id));
      } else {
        out.push(piece("shower", room.x2 - 0.7, room.z2 - 0.8, 0, 1.0, 1.0, room.id));
        out.push(piece("toilet", room.x1 + 0.45, room.z2 - 0.5, 90, 0.42, 0.62, room.id));
      }
      break;
    }
    case "wc": {
      out.push(piece("toilet", cx, room.z1 + 0.55, 0, 0.42, 0.62, room.id));
      out.push(piece("vanity", room.x2 - 0.45, cz + 0.2, 270, 0.9, 0.45, room.id));
      break;
    }
    case "study": {
      out.push(piece("desk", cx, room.z2 - 0.65, 180, Math.min(1.9, w * 0.7), 0.72, room.id));
      out.push(piece("shelf", room.x1 + 0.25, cz, 90, Math.min(2.2, d * 0.7), 0.36, room.id));
      break;
    }
    case "laundry": {
      out.push(piece("washer", room.x1 + 0.55, room.z1 + 0.45, 0, 0.65, 0.65, room.id));
      out.push(piece("washer", room.x1 + 1.3, room.z1 + 0.45, 0, 0.65, 0.65, room.id));
      out.push(piece("shelf", cx, room.z2 - 0.3, 180, Math.min(2.0, w * 0.8), 0.35, room.id));
      break;
    }
    case "storage": {
      out.push(piece("shelf", room.x1 + 0.25, cz, 90, Math.min(2.4, d * 0.8), 0.4, room.id));
      out.push(piece("shelf", room.x2 - 0.25, cz, 270, Math.min(2.4, d * 0.8), 0.4, room.id));
      break;
    }
    case "dressing": {
      out.push(piece("wardrobe", cx, room.z1 + 0.35, 0, Math.max(1.2, w - 0.8), 0.6, room.id));
      out.push(piece("wardrobe", room.x1 + 0.3, cz + 0.4, 90, Math.max(1.2, d - 1.2), 0.6, room.id));
      break;
    }
    case "hall": {
      if (w > 2.8) {
        out.push(piece("bench", room.x1 + 0.5, room.z2 - 0.6, 90, 1.3, 0.42, room.id));
        out.push(piece("plant", room.x2 - 0.6, room.z2 - 0.7, 0, 0.5, 0.5, room.id));
      }
      break;
    }
    case "corridor": {
      if (w > 2.2) out.push(piece("bench", room.x1 + 0.4, cz, 90, 1.5, 0.4, room.id));
      out.push(piece("plant", room.x2 - 0.45, room.z2 - 0.9, 0, 0.45, 0.45, room.id));
      break;
    }
    default:
      break;
  }
  return out;
}

function furnishTerraces(terraces: PlanTerrace[]): FurniturePiece[] {
  const out: FurniturePiece[] = [];
  for (const terrace of terraces) {
    const { x: cx, z: cz } = centreOf(terrace);
    const w = terrace.x2 - terrace.x1;
    const d = terrace.z2 - terrace.z1;
    if (terrace.deck === "timber") {
      out.push(piece("outdoorTable", cx, cz, 0, Math.min(1.6, w * 0.6), Math.min(1.0, d * 0.5), terrace.id));
      out.push(piece("diningChairs", cx, cz, 0, Math.min(1.6, w * 0.6), Math.min(1.7, d * 0.8), terrace.id));
      out.push(piece("lounger", terrace.x1 + 0.8, cz + d * 0.3, 90, 0.75, 1.9, terrace.id));
      out.push(piece("plant", terrace.x2 - 0.6, terrace.z1 + 0.6, 0, 0.6, 0.6, terrace.id));
    } else if (w > 3 && d > 1.6) {
      out.push(piece("outdoorTable", cx + w * 0.25, cz, 0, 1.4, 0.9, terrace.id));
      out.push(piece("diningChairs", cx + w * 0.25, cz, 0, 1.4, 1.5, terrace.id));
      out.push(piece("plant", terrace.x1 + 0.7, cz, 0, 0.6, 0.6, terrace.id));
    } else {
      out.push(piece("plant", terrace.x1 + 0.5, cz, 0, 0.5, 0.5, terrace.id));
    }
  }
  return out;
}

export function getFloorPlan(typology: Typology): FloorPlan {
  const base = BASE_PLANS[typology];
  pieceSeq = 0;
  const furniture = [...base.rooms.flatMap(furnishRoom), ...furnishTerraces(base.terraces)];
  return { ...base, furniture };
}

export const FLOOR_PLANS: Record<Typology, FloorPlan> = {
  T1: getFloorPlan("T1"),
  T2: getFloorPlan("T2"),
  T3: getFloorPlan("T3"),
  T4: getFloorPlan("T4"),
};

/** Net internal area from room polygons (excludes terraces). */
export function netInternalArea(plan: FloorPlan): number {
  return Math.round(plan.rooms.reduce((sum, room) => sum + areaOf(room), 0) * 10) / 10;
}

export function roomAt(plan: FloorPlan, x: number, z: number): PlanRoom | null {
  return plan.rooms.find((r) => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) ?? null;
}
