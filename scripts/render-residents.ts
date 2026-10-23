/**
 * Render the residents without a browser.
 *
 * There is no Chromium in this environment (the Playwright CDN is blocked), so a
 * WebGL screenshot is not available. This script takes the *same* module the
 * renderer uses — `fillBody()` — steps the *same* simulation, and rasterises the
 * resulting primitives with a z-buffer into a PNG. What it proves is placement,
 * scale, articulation and colour; what it cannot prove is the WebGL path itself.
 *
 *   npx tsx scripts/render-residents.ts
 *
 * Writes docs/residents-*.png and docs/site-three-quarter.png. The site view
 * also draws the real house geometry (`buildHouseGeometry`, triangle for
 * triangle) so placement, height and ground contact can be judged together with
 * the population.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { SEED_UNITS } from "../src/lib/domain/inventory";
import { footpaths } from "../src/lib/3d/circulation";
import { SITE } from "../src/lib/3d/site";
import { getFloorPlan } from "../src/lib/domain/floorplans";
import { HOUSE_CONFIG, buildHouseGeometry, type HouseGeometrySet } from "../src/components/three/house-geometry";
import { buildPlotGeometries } from "../src/components/three/site/plot-geometry";
import { buildLagoonGeometries } from "../src/components/three/site/lagoon-geometry";
import { garagePlan, plotRearDepth, plotWallsFor, poolFor } from "../src/lib/3d/site";
import {
  RESIDENTS,
  buildResidentWorld,
  createResidentSim,
  stepResidentSim,
} from "../src/lib/3d/residents";
import { BODY_PRIMITIVE, PART_COLOUR, fillBody, limbAxis, createBodyBuffer, type BodyTransform } from "../src/lib/3d/resident-skeleton";

type Vec3 = [number, number, number];

const entries = SEED_UNITS.map((unit) => ({
  code: unit.code,
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: (unit.position.rotationY * Math.PI) / 180,
  typology: unit.typology,
}));

const world = buildResidentWorld(entries);
const sim = createResidentSim(world, { count: 20, seed: 20260214 });
// Let the opening conversations form, so the pictures show more than one state.
for (let i = 0; i < 400 * 30; i += 1) {
  stepResidentSim(sim, 1 / 30);
  // For the close-up, stop as soon as a pair is standing and talking.
  if (sim.conversations.started >= 1 && sim.residents.some((resident) => resident.state === "interacting" && resident.stateAge > 1.5)) break;
}

const body = createBodyBuffer();

/* ------------------------------------------------------------------ *
 * Primitive meshes (unit ellipsoid, unit cylinder along +Y)
 * ------------------------------------------------------------------ */

function sphereTriangles(rings = 8, segments = 12): Vec3[][] {
  const triangles: Vec3[][] = [];
  const point = (u: number, v: number): Vec3 => [
    Math.sin(v) * Math.cos(u),
    Math.cos(v),
    Math.sin(v) * Math.sin(u),
  ];
  for (let r = 0; r < rings; r += 1) {
    const v0 = (r / rings) * Math.PI;
    const v1 = ((r + 1) / rings) * Math.PI;
    for (let s = 0; s < segments; s += 1) {
      const u0 = (s / segments) * Math.PI * 2;
      const u1 = ((s + 1) / segments) * Math.PI * 2;
      const a = point(u0, v0);
      const b = point(u1, v0);
      const c = point(u1, v1);
      const d = point(u0, v1);
      if (r > 0) triangles.push([a, b, c]);
      if (r < rings - 1) triangles.push([a, c, d]);
    }
  }
  return triangles;
}

function cylinderTriangles(segments = 10): Vec3[][] {
  const triangles: Vec3[][] = [];
  for (let s = 0; s < segments; s += 1) {
    const u0 = (s / segments) * Math.PI * 2;
    const u1 = ((s + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(u0);
    const z0 = Math.sin(u0);
    const x1 = Math.cos(u1);
    const z1 = Math.sin(u1);
    const top = 0.5;
    const bottom = -0.5;
    triangles.push([
      [x0, bottom, z0],
      [x1, bottom, z1],
      [x1, top, z1],
    ]);
    triangles.push([
      [x0, bottom, z0],
      [x1, top, z1],
      [x0, top, z0],
    ]);
    // caps
    triangles.push([
      [0, top, 0],
      [x0, top, z0],
      [x1, top, z1],
    ]);
    triangles.push([
      [0, bottom, 0],
      [x1, bottom, z1],
      [x0, bottom, z0],
    ]);
  }
  return triangles;
}

const SPHERE = sphereTriangles();
const CYLINDER = cylinderTriangles();

/* ------------------------------------------------------------------ *
 * Transform + rasterise
 * ------------------------------------------------------------------ */

type Palette = Record<"skin" | "hair" | "shirt" | "trousers" | "shoe" | "eye", [number, number, number]>;

interface _PaletteShape {
  skin: [number, number, number];
  hair: [number, number, number];
  shirt: [number, number, number];
  trousers: [number, number, number];
  shoe: [number, number, number];
  eye: [number, number, number];
}

function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function paletteFor(index: number): Palette {
  const resident = sim.residents[index]!;
  return {
    skin: rgb(resident.style.skin),
    hair: rgb(resident.style.hair),
    shirt: rgb(resident.style.shirt),
    trousers: rgb(resident.style.trousers),
    shoe: [0.11, 0.12, 0.13],
    eye: [0.06, 0.05, 0.05],
  };
}

const LIGHT: Vec3 = normalize([-0.45, 0.82, -0.35]);

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Transform a primitive vertex by an instance transform. */
function placeVertex(vertex: Vec3, transform: BodyTransform): Vec3 {
  // Local primitive space -> body space.
  let local: Vec3;
  if (BODY_PRIMITIVE[transform.part] === "cylinder") {
    // The cylinder spans ±0.5 on Y; the renderer scales Y by the limb length.
    const axis = limbAxis(transform);
    const centreY = 0;
    // Scale in the cylinder's own frame (radial on the two perpendicular axes,
    // length along the axis) and only then rotate. Scaling afterwards in world
    // axes squashes a tilted limb into a fin — that was the second render.
    const along = scale([axis.x, axis.y, axis.z], vertex[1] * transform.sy);
    const reference: Vec3 = Math.abs(axis.y) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const right = normalize(cross(reference, [axis.x, axis.y, axis.z]));
    const up2 = normalize(cross([axis.x, axis.y, axis.z], right));
    const radial = add(scale(right, vertex[0] * transform.sx), scale(up2, vertex[2] * transform.sz));
    local = add([0, centreY, 0], add(along, radial));
    return [transform.x + local[0], transform.y + local[1], transform.z + local[2]];
  }
  // Ellipsoid: scale, spin about Y, translate.
  const sx = vertex[0] * transform.sx;
  const sy = vertex[1] * transform.sy;
  const sz = vertex[2] * transform.sz;
  const cos = Math.cos(transform.yaw);
  const sin = Math.sin(transform.yaw);
  return [transform.x + sx * cos + sz * sin, transform.y + sy, transform.z - sx * sin + sz * cos];
}

interface Frame {
  width: number;
  height: number;
  colour: Float32Array;
  depth: Float32Array;
  eye: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  fov: number;
}

function makeFrame(eye: Vec3, target: Vec3, width: number, height: number, fov = 38): Frame {
  const forward = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const colour = new Float32Array(width * height * 3);
  const depth = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY);
  // Sky gradient.
  for (let y = 0; y < height; y += 1) {
    const t = y / height;
    const sky: Vec3 = [0.74 - t * 0.12, 0.82 - t * 0.08, 0.9 - t * 0.04];
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      colour[i] = sky[0];
      colour[i + 1] = sky[1];
      colour[i + 2] = sky[2];
    }
  }
  return { width, height, colour, depth, eye, forward, right, up, fov };
}

function project(frame: Frame, point: Vec3): { x: number; y: number; z: number } {
  const rel = [point[0] - frame.eye[0], point[1] - frame.eye[1], point[2] - frame.eye[2]] as Vec3;
  const z = dot(rel, frame.forward);
  const x = dot(rel, frame.right);
  const y = dot(rel, frame.up);
  const tan = Math.tan((frame.fov * Math.PI) / 360);
  const aspect = frame.width / frame.height;
  return {
    x: ((x / (z * tan * aspect)) * 0.5 + 0.5) * frame.width,
    y: (0.5 - (y / (z * tan)) * 0.5) * frame.height,
    z,
  };
}

function triangle(frame: Frame, a: Vec3, b: Vec3, c: Vec3, colour: Vec3): void {
  const pa = project(frame, a);
  const pb = project(frame, b);
  const pc = project(frame, c);
  if (pa.z <= 0.05 || pb.z <= 0.05 || pc.z <= 0.05) return;
  const area = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
  if (Math.abs(area) < 1e-6) return;
  const normal = normalize(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
  const lit = 0.45 + 0.55 * Math.max(0, Math.abs(dot(normal, LIGHT)));
  const shade: Vec3 = [colour[0] * lit, colour[1] * lit, colour[2] * lit];

  const minX = Math.max(0, Math.floor(Math.min(pa.x, pb.x, pc.x)));
  const maxX = Math.min(frame.width - 1, Math.ceil(Math.max(pa.x, pb.x, pc.x)));
  const minY = Math.max(0, Math.floor(Math.min(pa.y, pb.y, pc.y)));
  const maxY = Math.min(frame.height - 1, Math.ceil(Math.max(pa.y, pb.y, pc.y)));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((pb.x - px) * (pc.y - py) - (pb.y - py) * (pc.x - px)) / area;
      const w1 = ((pc.x - px) * (pa.y - py) - (pc.y - py) * (pa.x - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * pa.z + w1 * pb.z + w2 * pc.z;
      const index = y * frame.width + x;
      if (z >= frame.depth[index]!) continue;
      frame.depth[index] = z;
      const i = index * 3;
      frame.colour[i] = shade[0];
      frame.colour[i + 1] = shade[1];
      frame.colour[i + 2] = shade[2];
    }
  }
}

/* ------------------------------------------------------------------ *
 * Houses — the real merged geometry, not boxes
 * ------------------------------------------------------------------ */

const HOUSE_COLOURS: Record<string, Vec3> = {
  stone: [0.81, 0.78, 0.71],
  render: [0.9, 0.89, 0.84],
  concrete: [0.83, 0.8, 0.75],
  timber: [0.66, 0.52, 0.38],
  timberDark: [0.33, 0.25, 0.17],
  charcoal: [0.14, 0.15, 0.12],
  metal: [0.16, 0.17, 0.15],
  glass: [0.14, 0.2, 0.2],
  glassRail: [0.68, 0.74, 0.71],
  deck: [0.69, 0.54, 0.38],
  gravel: [0.8, 0.77, 0.7],
  interior: [0.08, 0.08, 0.07],
};

function drawHouses(frame: Frame): void {
  for (const unit of SEED_UNITS) {
    const config = HOUSE_CONFIG[unit.typology];
    if (!config) continue;
    const plan = getFloorPlan(unit.typology);
    const set: HouseGeometrySet = buildHouseGeometry(plan, config, Number(unit.code.replace(/\D/g, "")) || 1);
    drawSet(frame, set, HOUSE_COLOURS, [0.75, 0.75, 0.72], unit.position.x, unit.position.z, unit.position.rotationY);
  }
}

const PLOT_COLOURS: Record<string, Vec3> = {
  render: [0.9, 0.89, 0.84],
  stone: [0.81, 0.78, 0.71],
  concrete: [0.83, 0.8, 0.75],
  timber: [0.66, 0.52, 0.38],
  timberDark: [0.33, 0.25, 0.17],
  charcoal: [0.14, 0.15, 0.12],
  metal: [0.16, 0.17, 0.15],
  white: [0.94, 0.93, 0.9],
  deck: [0.69, 0.54, 0.38],
  poolTile: [0.72, 0.78, 0.76],
  water: [0.18, 0.42, 0.46],
  glass: [0.14, 0.2, 0.2],
  hedge: [0.3, 0.37, 0.23],
  trunk: [0.36, 0.29, 0.21],
  foliage0: [0.36, 0.47, 0.26],
  foliage1: [0.42, 0.53, 0.29],
  foliage2: [0.31, 0.42, 0.24],
  carPaint0: [0.45, 0.11, 0.12],
  carPaint1: [0.12, 0.13, 0.15],
  carPaint2: [0.55, 0.56, 0.54],
  carGlass: [0.1, 0.13, 0.14],
};

/** Draw a geometry set in the local frame of a house or a plot. */
function drawSet(
  frame: Frame,
  set: Partial<Record<string, import("three").BufferGeometry>>,
  colours: Record<string, Vec3>,
  fallback: Vec3,
  originX: number,
  originZ: number,
  yawDegrees: number,
): void {
  const yaw = (yawDegrees * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  for (const [key, geometry] of Object.entries(set)) {
    if (!geometry) continue;
    const colour = colours[key] ?? fallback;
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      const toWorld = (vertex: number): Vec3 => {
        const lx = position.getX(vertex);
        const ly = position.getY(vertex);
        const lz = position.getZ(vertex);
        return [originX + lx * cos + lz * sin, ly, originZ - lx * sin + lz * cos];
      };
      triangle(frame, toWorld(ia), toWorld(ib), toWorld(ic), colour);
    }
  }
}

/** Plot walls, carport, pool, planting: the same parts the scene merges. */
function drawPlots(frame: Frame): void {
  for (const unit of SEED_UNITS) {
    const code = unit.code;
    const typology = unit.typology;
    const seed = Number(code.replace(/\D/g, "")) || 1;
    const rearDepth = plotRearDepth(unit.position, unit.position.rotationY, typology);
    const { garage } = garagePlan(unit.position, unit.position.rotationY, typology);
    const pool = poolFor(code, typology, rearDepth);
    const { geometries } = buildPlotGeometries({
      code,
      rearDepth,
      walls: plotWallsFor(typology, rearDepth),
      garage,
      pool,
      seed,
      lowQuality: true,
    });
    drawSet(frame, geometries, PLOT_COLOURS, [0.78, 0.76, 0.72], unit.position.x, unit.position.z, unit.position.rotationY);
  }
}

/** The pool, deck and pavilion at the middle of the condominium. */
function drawLagoon(frame: Frame): void {
  const { geometries } = buildLagoonGeometries({ lowQuality: true });
  drawSet(frame, geometries, PLOT_COLOURS, [0.7, 0.72, 0.7], SITE.lagoon.x, SITE.lagoon.z, 0);
}

function drawResidents(frame: Frame, only?: typeof sim.residents): void {
  for (const resident of only ?? sim.residents) {
    fillBody(resident, body);
    const palette = paletteFor(resident.index);
    for (const transform of body) {
      const triangles = BODY_PRIMITIVE[transform.part] === "cylinder" ? CYLINDER : SPHERE;
      const colour = palette[PART_COLOUR[transform.part]];
      for (const tri of triangles) {
        // The hair is a hemisphere in the renderer; drop the lower half here so
        // the offline image matches what WebGL draws.
        // The cap of hair is a hemisphere in the renderer and in WebGL; the
        // long panel (slot 1) is drawn whole.
        if (transform.part === "hair" && transform.slot === 0 && (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3 < -0.02) continue;
        triangle(
          frame,
          placeVertex(tri[0]!, transform),
          placeVertex(tri[1]!, transform),
          placeVertex(tri[2]!, transform),
          colour,
        );
      }
    }
  }
}

/** Ground plane, plus the real footpath ribbons so placement can be judged. */
function drawGround(frame: Frame): void {
  // Tiles, not one giant quad: a quad that extends behind the camera is
  // rejected as a whole, which left the ground as sky in the first render.
  const size = 220;
  // Small tiles: a triangle with one vertex behind the camera is rejected whole,
  // and a 10 m tile left a blue band of missing ground in the near foreground.
  const tile = 4;
  const grass: Vec3 = [0.44, 0.5, 0.33];
  for (let x = SITE.center.x - size; x < SITE.center.x + size; x += tile) {
    for (let z = SITE.center.z - size; z < SITE.center.z + size; z += tile) {
      const a: Vec3 = [x, 0, z];
      const b: Vec3 = [x + tile, 0, z];
      const c: Vec3 = [x + tile, 0, z + tile];
      const d: Vec3 = [x, 0, z + tile];
      triangle(frame, a, b, c, grass);
      triangle(frame, a, c, d, grass);
    }
  }

  const path: Vec3 = [0.72, 0.7, 0.66];
  const halfWidth = 1.1;
  for (const walk of footpaths(entries)) {
    for (let i = 0; i < walk.points.length - 1; i += 1) {
      const a = walk.points[i]!;
      const b = walk.points[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz) || 1;
      const ox = (-dz / length) * halfWidth;
      const oz = (dx / length) * halfWidth;
      const y = RESIDENTS.groundY;
      const p1: Vec3 = [a.x + ox, y, a.z + oz];
      const p2: Vec3 = [b.x + ox, y, b.z + oz];
      const p3: Vec3 = [b.x - ox, y, b.z - oz];
      const p4: Vec3 = [a.x - ox, y, a.z - oz];
      triangle(frame, p1, p2, p3, path);
      triangle(frame, p1, p3, p4, path);
    }
  }
}

/** A measured reference next to the figures: 1.78 m adult, 2.70 m door. */
function drawScaleReferences(frame: Frame, x = SITE.center.x - 16, z = SITE.center.z - 8): void {
  const post = (height: number, colour: Vec3, offset: number) => {
    const width = 0.16;
    const y = 0;
    const px = x + offset;
    const a: Vec3 = [px - width, y, z];
    const b: Vec3 = [px + width, y, z];
    const c: Vec3 = [px + width, y + height, z];
    const d: Vec3 = [px - width, y + height, z];
    triangle(frame, a, b, c, colour);
    triangle(frame, a, c, d, colour);
  };
  post(1.78, [0.2, 0.24, 0.3], 0);
  post(2.7, [0.55, 0.42, 0.3], 1.4);
}

/* ------------------------------------------------------------------ *
 * PNG output
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(path: string, frame: Frame): void {
  const raw = Buffer.alloc((frame.width * 3 + 1) * frame.height);
  let offset = 0;
  for (let y = 0; y < frame.height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < frame.width; x += 1) {
      const i = (y * frame.width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        // A touch of gamma so the shading does not read as flat black.
        const value = Math.min(1, Math.max(0, Math.pow(frame.colour[i + channel] ?? 0, 1 / 1.15)));
        raw[offset] = Math.round(value * 255);
        offset += 1;
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(frame.width, 0);
  header.writeUInt32BE(frame.height, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${frame.width}×${frame.height})`);
}

/* ------------------------------------------------------------------ *
 * Two views
 * ------------------------------------------------------------------ */

// 1. The whole site, from the viewer's default camera.
const overview = makeFrame([62, 52, 88], [SITE.center.x, 0, SITE.center.z], 1400, 900, 36);
drawGround(overview);
drawLagoon(overview);
drawPlots(overview);
drawHouses(overview);
drawScaleReferences(overview);
drawResidents(overview);
writePng("docs/residents-overview.png", overview);

// 1b. A three-quarter view over the houses and the people together: the same
//     geometry the scene draws, so placement and ground contact can be judged.
const quarter = makeFrame(
  [SITE.center.x + 26, 13, SITE.center.z + 44],
  [SITE.center.x + 6, 2.4, SITE.center.z + 8],
  1400,
  900,
  46,
);
drawGround(quarter);
drawLagoon(quarter);
drawPlots(quarter);
drawHouses(quarter);
drawResidents(quarter);
writePng("docs/site-three-quarter.png", quarter);

// 1c. One residence and its plot, close enough to judge walls, carport, pool,
//     roofline and ground contact.
const hero = SEED_UNITS[0]!;
const heroFrame = makeFrame(
  [hero.position.x + 13, 6.5, hero.position.z + 15],
  [hero.position.x, 2.6, hero.position.z],
  1200,
  900,
  46,
);
drawGround(heroFrame);
drawPlots(heroFrame);
drawHouses(heroFrame);
drawResidents(heroFrame);
writePng("docs/site-house.png", heroFrame);

// 2. A close-up of the pair, from the side, so it is plain whether they are
//    facing each other and at what distance.
const pair = sim.residents.find((resident) => resident.partner !== null && resident.state === "interacting");
const focus = pair ?? sim.residents[0]!;
const partner = pair?.partner !== null && pair?.partner !== undefined ? sim.residents[pair.partner] : undefined;
const midX = partner ? (focus.x + partner.x) / 2 : focus.x;
const midZ = partner ? (focus.z + partner.z) / 2 : focus.z;
const axisX = partner ? partner.x - focus.x : 1;
const axisZ = partner ? partner.z - focus.z : 0;
const axisLength = Math.hypot(axisX, axisZ) || 1;
const sideX = -axisZ / axisLength;
const sideZ = axisX / axisLength;
const closeup = makeFrame([midX + sideX * 3.1, 1.62, midZ + sideZ * 3.1], [midX, 1.05, midZ], 1200, 900, 42);
drawGround(closeup);
// Put the measuring posts beside the pair, not behind their heads.
drawScaleReferences(closeup, midX + sideX * -2.0 + axisX * 1.2, midZ + sideZ * -2.0 + axisZ * 1.2);
drawResidents(closeup);
writePng("docs/residents-closeup.png", closeup);

if (partner) {
  const gap = Math.hypot(partner.x - focus.x, partner.z - focus.z);
  const toPartner = Math.atan2(partner.x - focus.x, partner.z - focus.z);
  const toFocus = Math.atan2(focus.x - partner.x, focus.z - partner.z);
  const off = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  console.log(
    `pair ${focus.id} / ${partner.id}: gap ${gap.toFixed(2)} m, ` +
      `facing error ${(off(focus.rotationY, toPartner) * 57.3).toFixed(1)}° / ${(off(partner.rotationY, toFocus) * 57.3).toFixed(1)}°`,
  );
}

// 3. One head from the front, alone in frame: this is exactly what the face is.
const solo = sim.residents.find((resident) => resident.state === "walking") ?? focus;
const headX = solo.x + Math.sin(solo.rotationY) * 1.0;
const headZ = solo.z + Math.cos(solo.rotationY) * 1.0;
const head = makeFrame([headX, 1.58, headZ], [solo.x, 1.55, solo.z], 700, 700, 36);
drawResidents(head, [solo]);
writePng("docs/residents-head.png", head);

// 4. One person mid-stride, from the side: the gait is the thing under test —
//    a stance leg planted on the path and a bent swing knee.
let strideWalker = sim.residents.find((resident) => resident.state === "walking" && Math.abs(Math.sin(resident.stride)) > 0.9);
for (let i = 0; i < 200 && !strideWalker; i += 1) {
  for (let k = 0; k < 3; k += 1) stepResidentSim(sim, 1 / 60);
  strideWalker = sim.residents.find((resident) => resident.state === "walking" && Math.abs(Math.sin(resident.stride)) > 0.9);
}
if (strideWalker) {
  const side = strideWalker.rotationY + Math.PI / 2;
  const walk = makeFrame(
    [strideWalker.x + Math.sin(side) * 3.0, 1.18, strideWalker.z + Math.cos(side) * 3.0],
    [strideWalker.x, 0.95, strideWalker.z],
    900,
    900,
    40,
  );
  drawGround(walk);
  drawResidents(walk, [strideWalker]);
  writePng("docs/residents-walking.png", walk);
  console.log(
    `walking ${strideWalker.id}: stride ${(Math.abs(Math.sin(strideWalker.stride)) * 100).toFixed(0)} %, ` +
      `speed ${strideWalker.speed.toFixed(2)} m/s`,
  );
}

const states = sim.residents.reduce<Record<string, number>>((counts, resident) => {
  counts[resident.state] = (counts[resident.state] ?? 0) + 1;
  return counts;
}, {});
console.log("states at render:", states);
console.log("conversations:", sim.conversations, "navFailures:", sim.navFailures);
