/**
 * Offline top-down renderer for the masterplan.
 *
 * Draws exactly what the scene places (roads, plots, houses, pools, carports,
 * courts, lagoon, planting beds, trees) into a PNG, so the layout can be
 * reviewed — and regressions spotted — without a browser.
 *
 *   npx tsx scripts/render-plan.ts [out.png]     (default: docs/masterplan.png)
 *
 * The suite in tests/site.test.ts asserts the same invariants the image shows:
 * no house on a road, no tree or flower inside a plot, no court overlap.
 */
import { deflateSync } from "node:zlib";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { SEED_UNITS } from "../src/lib/domain/inventory";
import { getFloorPlan } from "../src/lib/domain/floorplans";
import {
  COURTS,
  CLUBHOUSE,
  PLANTING_BEDS,
  PLOT,
  SITE,
  courtBounds,
  drivewayFor,
  garagePlan,
  lampPositions,
  plotRearDepth,
  plotWallsFor,
  poolFor,
  scatterFlowers,
  scatterShrubs,
  scatterTrees,
  sportsKeepOut,
} from "../src/lib/3d/site";

const SCALE = 4;
const MIN_X = -106;
const MAX_X = 80;
const MIN_Z = -72;
const MAX_Z = 88;
const W = Math.round((MAX_X - MIN_X) * SCALE);
const H = Math.round((MAX_Z - MIN_Z) * SCALE);
const buf = new Uint8Array(W * H * 3);

const px = (x: number, z: number): [number, number] => [(x - MIN_X) * SCALE, (z - MIN_Z) * SCALE];
function put(x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
}
function rect(minX: number, minZ: number, maxX: number, maxZ: number, r: number, g: number, b: number) {
  const [x0, y0] = px(minX, minZ);
  const [x1, y1] = px(maxX, maxZ);
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) put(x, y, r, g, b);
}
function ellipse(cx: number, cz: number, rx: number, rz: number, r: number, g: number, b: number) {
  const [x0, y0] = px(cx - rx, cz - rz);
  const [x1, y1] = px(cx + rx, cz + rz);
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W, Math.ceil(x1)); x++) {
      const dx = (x / SCALE + MIN_X - cx) / rx;
      const dz = (y / SCALE + MIN_Z - cz) / rz;
      if (dx * dx + dz * dz <= 1) put(x, y, r, g, b);
    }
}
function circle(cx: number, cz: number, radius: number, r: number, g: number, b: number) {
  ellipse(cx, cz, radius, radius, r, g, b);
}
function localRect(u: { x: number; z: number; rot: number }, cx: number, cz: number, w: number, d: number, r: number, g: number, b: number) {
  const rad = (u.rot * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const [x0, y0] = px(u.x - Math.hypot(w, d) / 2 - 1, u.z - Math.hypot(w, d) / 2 - 1);
  const [x1, y1] = px(u.x + Math.hypot(w, d) / 2 + 1, u.z + Math.hypot(w, d) / 2 + 1);
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W, Math.ceil(x1)); x++) {
      const wx = x / SCALE + MIN_X - u.x;
      const wz = y / SCALE + MIN_Z - u.z;
      const lx = wx * c - wz * s;
      const lz = wx * s + wz * c;
      if (Math.abs(lx - cx) <= w / 2 && Math.abs(lz - cz) <= d / 2) put(x, y, r, g, b);
    }
}

// ground + fence
rect(MIN_X, MIN_Z, MAX_X, MAX_Z, 205, 213, 197);
rect(SITE.fence.minX, SITE.fence.minZ, SITE.fence.maxX, SITE.fence.maxZ, 189, 202, 175);

// roads
const ringOuter = SITE.ring.outer;
const ringInner = SITE.ring.inner;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const wx = x / SCALE + MIN_X;
    const wz = y / SCALE + MIN_Z;
    const inOuter = sd(wx, wz, ringOuter);
    const inInner = sd(wx, wz, ringInner);
    if (inOuter <= 0 && inInner >= 0) put(x, y, 122, 122, 122);
    else if (inOuter <= 1.6 && inOuter > 0) put(x, y, 196, 192, 182);
    else if (inInner >= -1.6 && inInner < 0) put(x, y, 196, 192, 182);
  }
rect(SITE.boulevard.minX, SITE.boulevard.minZ, SITE.boulevard.maxX, SITE.boulevard.maxZ, 122, 122, 122);
rect(SITE.boulevard.minX - 1.6, SITE.boulevard.minZ, SITE.boulevard.minX, SITE.boulevard.maxZ, 196, 192, 182);
rect(SITE.boulevard.maxX, SITE.boulevard.minZ, SITE.boulevard.maxX + 1.6, SITE.boulevard.maxZ, 196, 192, 182);
rect(SITE.serviceRoad.minX, SITE.serviceRoad.minZ - 1.6, SITE.serviceRoad.maxX, SITE.serviceRoad.maxZ + 1.6, 196, 192, 182);
rect(SITE.serviceRoad.minX, SITE.serviceRoad.minZ, SITE.serviceRoad.maxX, SITE.serviceRoad.maxZ, 122, 122, 122);

// lagoon deck + water + pavilion
ellipse(SITE.lagoon.x, SITE.lagoon.z, SITE.lagoon.radiusX + SITE.lagoon.deck, SITE.lagoon.radiusZ + SITE.lagoon.deck, 214, 205, 186);
ellipse(SITE.lagoon.x, SITE.lagoon.z, SITE.lagoon.radiusX, SITE.lagoon.radiusZ, 68, 168, 190);

// sports park
rect(SITE.sportsPark.minX, SITE.sportsPark.minZ, SITE.sportsPark.maxX, SITE.sportsPark.maxZ, 184, 197, 168);
for (const court of COURTS) {
  const b = courtBounds(court);
  rect(b.minX, b.minZ, b.maxX, b.maxZ, 96, 100, 96);
  if (court.surface === "grass") rect(court.x - court.width / 2, court.z - court.depth / 2, court.x + court.width / 2, court.z + court.depth / 2, 96, 150, 78);
  else rect(court.x - court.width / 2, court.z - court.depth / 2, court.x + court.width / 2, court.z + court.depth / 2, 176, 92, 72);
  const hw = court.width / 2;
  const hd = court.depth / 2;
  const line = court.surface === "grass" ? ([245, 248, 245] as const) : ([245, 248, 245] as const);
  rect(court.x - hw, court.z - hd, court.x + hw, court.z - hd + 0.35, ...line);
  rect(court.x - hw, court.z + hd - 0.35, court.x + hw, court.z + hd, ...line);
  rect(court.x - hw, court.z - hd, court.x - hw + 0.35, court.z + hd, ...line);
  rect(court.x + hw - 0.35, court.z - hd, court.x + hw, court.z + hd, ...line);
  rect(court.x - hw, court.z - 0.18, court.x + hw, court.z + 0.18, ...line);
}
rect(CLUBHOUSE.x - CLUBHOUSE.width / 2, CLUBHOUSE.z - CLUBHOUSE.depth / 2, CLUBHOUSE.x + CLUBHOUSE.width / 2, CLUBHOUSE.z + CLUBHOUSE.depth / 2, 60, 66, 72);

// planting beds
for (const bed of PLANTING_BEDS) rect(bed.minX, bed.minZ, bed.maxX, bed.maxZ, 172, 190, 158);

// plots
for (const unit of SEED_UNITS) {
  const u = { x: unit.position.x, z: unit.position.z, rot: unit.position.rotationY };
  const plan = getFloorPlan(unit.typology);
  const rear = plotRearDepth(unit.position, unit.position.rotationY, unit.typology);
  for (const wall of plotWallsFor(unit.typology, rear)) localRect(u, wall.x, wall.z, wall.width, wall.depth, 88, 88, 84);
  localRect(u, 0, 0, plan.widthM, plan.depthM, 58, 64, 70);
  const { garage } = garagePlan(unit.position, unit.position.rotationY, unit.typology);
  const drive = drivewayFor(unit.position, unit.typology, unit.position.rotationY, garage?.x ?? 0);
  if (drive) localRect(u, garage?.x ?? 0, plan.depthM / 2 + drive.length / 2, 3.4, drive.length, 206, 198, 180);
  if (garage) localRect(u, garage.x, garage.z, garage.width + 0.9, garage.depth + 0.4, 120, 96, 70);
  const pool = poolFor(unit.code, unit.typology, rear);
  if (pool) {
    localRect(u, pool.x, pool.z, pool.width + pool.deck * 2, pool.depth + pool.deck * 2, 176, 140, 96);
    localRect(u, pool.x, pool.z, pool.width, pool.depth, 70, 170, 190);
  }
}

// vegetation
const houses = SEED_UNITS.map((u) => ({ position: u.position, typology: u.typology, rotationY: u.position.rotationY }));
const poolZones = SEED_UNITS.flatMap((unit) => {
  const rear = plotRearDepth(unit.position, unit.position.rotationY, unit.typology);
  const pool = poolFor(unit.code, unit.typology, rear);
  if (!pool) return [];
  const rad = (unit.position.rotationY * Math.PI) / 180;
  return [{ x: unit.position.x + pool.x * Math.cos(rad) + pool.z * Math.sin(rad), z: unit.position.z - pool.x * Math.sin(rad) + pool.z * Math.cos(rad), radius: Math.max(pool.width, pool.depth) / 2 + 1.8 }];
});
const trees = scatterTrees({ houses, count: 96, keepOut: [...poolZones, ...sportsKeepOut()] });
console.log("trees", trees.length);
for (const tree of trees) circle(tree.x, tree.z, 1.3, 56, 100, 52);
for (const shrub of scatterShrubs(houses)) circle(shrub.x, shrub.z, 0.6, 78, 124, 66);
for (const flower of scatterFlowers()) circle(flower.x, flower.z, 0.28, 220, 120 + flower.tone * 20, 130);
for (const lamp of lampPositions()) circle(lamp.x, lamp.z, 0.5, 232, 196, 84);

// hedge borders around every bed
for (const bed of PLANTING_BEDS) {
  rect(bed.minX, bed.minZ, bed.maxX, bed.minZ + 0.42, 60, 92, 52);
  rect(bed.minX, bed.maxZ - 0.42, bed.maxX, bed.maxZ, 60, 92, 52);
  rect(bed.minX, bed.minZ, bed.minX + 0.42, bed.maxZ, 60, 92, 52);
  rect(bed.maxX - 0.42, bed.minZ, bed.maxX, bed.maxZ, 60, 92, 52);
}
// pavilion on the lagoon deck
rect(SITE.pavilion.x - SITE.pavilion.width / 2, SITE.pavilion.z - SITE.pavilion.depth / 2, SITE.pavilion.x + SITE.pavilion.width / 2, SITE.pavilion.z + SITE.pavilion.depth / 2, 120, 96, 70);

// fence outline
rect(SITE.fence.minX - 0.6, SITE.fence.minZ - 0.6, SITE.fence.maxX + 0.6, SITE.fence.minZ + 0.6, 66, 66, 66);
rect(SITE.fence.minX - 0.6, SITE.fence.maxZ - 0.6, SITE.fence.maxX + 0.6, SITE.fence.maxZ + 0.6, 66, 66, 66);
rect(SITE.fence.minX - 0.6, SITE.fence.minZ, SITE.fence.minX + 0.6, SITE.fence.maxZ, 66, 66, 66);
rect(SITE.fence.maxX - 0.6, SITE.fence.minZ, SITE.fence.maxX + 0.6, SITE.fence.maxZ, 66, 66, 66);

function sd(x: number, z: number, rect: { minX: number; maxX: number; minZ: number; maxZ: number; radius: number }) {
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const hw = (rect.maxX - rect.minX) / 2 - rect.radius;
  const hd = (rect.maxZ - rect.minZ) / 2 - rect.radius;
  const qx = Math.abs(x - cx) - hw;
  const qz = Math.abs(z - cz) - hd;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rect.radius;
}

// PNG
function crc32(data: Buffer): number {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const out = resolve(process.argv[2] ?? "docs/masterplan.png");
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
void PLOT;
console.log("wrote", out, W, "x", H);
