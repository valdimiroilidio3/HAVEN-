/**
 * Offline render of the parked cars, before and after.
 *
 *   npx tsx scripts/render-cars.ts [output.png] [revision]
 *
 * There is no GPU in this environment, so this rasterises the *real* merged
 * geometry — the same `mergePartsByMaterial` the browser uses — with a
 * perspective camera and simple key/fill shading. It is evidence that the
 * geometry is right; it is not a claim about how the WebGL scene looks.
 */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import path from "node:path";
import * as THREE from "three";
import { mergePartsByMaterial } from "../src/components/three/site/plot-geometry";
import type { Part, PartMaterial } from "../src/lib/3d/parts";
import { CAR_MODELS, carParts, carSpec, type CarModel } from "../src/lib/3d/car";

type Vec = THREE.Vector3;

interface Cam {
  eye: Vec;
  target: Vec;
  fov: number;
}

const COLORS: Record<string, [number, number, number, number]> = {
  carPaint0: [0x8f, 0x12, 0x16, 1],
  carPaint1: [0x8d, 0x90, 0x94, 1],
  carPaint2: [0x1d, 0x30, 0x50, 1],
  carGlass: [0x14, 0x1c, 0x21, 1],
  charcoal: [0x22, 0x24, 0x22, 1],
  metal: [0x9a, 0x9e, 0xa2, 1],
  white: [0xf2, 0xf0, 0xe6, 1],
};

const KEY = new THREE.Vector3(-0.5, 0.82, 0.55).normalize();
const FILL = new THREE.Vector3(0.7, 0.35, -0.6).normalize();


interface Triangle {
  p: [Vec, Vec, Vec];
  /** Vertex normals, so the preview shades the way three.js will. */
  n: [Vec, Vec, Vec];
  key: string;
  depth: number;
}

/** Collect world-space triangles, then project them through one camera. */
function trianglesOf(parts: Part[]): Triangle[] {
  const merged = mergePartsByMaterial(parts);
  const out: Triangle[] = [];
  for (const [key, geometry] of Object.entries(merged) as Array<[string, THREE.BufferGeometry]>) {
    if (!geometry) continue;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      const vert = (k: number) => new THREE.Vector3().fromBufferAttribute(position, k);
      const norm = (k: number) => (normal ? new THREE.Vector3().fromBufferAttribute(normal, k).normalize() : new THREE.Vector3(0, 1, 0));
      out.push({
        p: [vert(ia), vert(ib), vert(ic)],
        n: [norm(ia), norm(ib), norm(ic)],
        key,
        depth: 0,
      });
    }
  }
  return out;
}

/**
 * Back faces are culled before shading, so normals must not be flipped here —
 * the old "flip toward the viewer" heuristic split the coachwork in half at the
 * point where the normal's z changed sign.
 */
function shade(key: string, normal: Vec): [number, number, number, number] {
  const base = COLORS[key] ?? [128, 128, 128, 1];
  const n = normal;
  const keyLight = Math.max(0, n.dot(KEY));
  const fill = Math.max(0, n.dot(FILL));
  // A cheap sheen on paint and metal: cars read as glossy mostly through the
  // highlight moving across the panels.
  const sheen = key === "metal" || key.startsWith("carPaint") ? Math.pow(keyLight, 14) * 90 : 0;
  const light = 0.34 + 0.6 * keyLight + 0.18 * fill;
  const alpha = key === "carGlass" ? 0.92 : base[3];
  return [
    Math.min(255, base[0] * light + sheen),
    Math.min(255, base[1] * light + sheen),
    Math.min(255, base[2] * light + sheen),
    alpha,
  ];
}

function rasterise(
  buf: Uint8Array,
  w: number,
  h: number,
  pts: Array<[number, number]>,
  colours: Array<[number, number, number, number]>,
): void {
  const minX = Math.max(0, Math.floor(Math.min(pts[0]![0], pts[1]![0], pts[2]![0])));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(pts[0]![0], pts[1]![0], pts[2]![0])));
  const minY = Math.max(0, Math.floor(Math.min(pts[0]![1], pts[1]![1], pts[2]![1])));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(pts[0]![1], pts[1]![1], pts[2]![1])));
  const edge = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const area = edge(pts[0]!, pts[1]!, pts[2]!);
  if (Math.abs(area) < 1e-9) return;
  const c0 = colours[0]!;
  const c1 = colours[1]!;
  const c2 = colours[2]!;
  const alpha = c0[3];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const p: [number, number] = [x + 0.5, y + 0.5];
      const w0 = edge(pts[1]!, pts[2]!, p) / area;
      const w1 = edge(pts[2]!, pts[0]!, p) / area;
      const w2 = edge(pts[0]!, pts[1]!, p) / area;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const i = (y * w + x) * 3;
      const r = c0[0] * w0 + c1[0] * w1 + c2[0] * w2;
      const g = c0[1] * w0 + c1[1] * w1 + c2[1] * w2;
      const b = c0[2] * w0 + c1[2] * w1 + c2[2] * w2;
      buf[i] = Math.round(buf[i]! * (1 - alpha) + r * alpha);
      buf[i + 1] = Math.round(buf[i + 1]! * (1 - alpha) + g * alpha);
      buf[i + 2] = Math.round(buf[i + 2]! * (1 - alpha) + b * alpha);
    }
  }
}

/** One rendered cell. */
function renderCell(parts: Part[], cam: Cam, width: number, height: number): Uint8Array {
  const forward = new THREE.Vector3().subVectors(cam.target, cam.eye).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const focal = height / 2 / Math.tan((cam.fov * Math.PI) / 360);

  const project = (v: Vec): { x: number; y: number; z: number } | null => {
    const d = new THREE.Vector3().subVectors(v, cam.eye);
    const z = d.dot(forward);
    if (z < 0.05) return null;
    return { x: width / 2 + (d.dot(right) / z) * focal, y: height / 2 - (d.dot(up) / z) * focal, z };
  };

  const buf = new Uint8Array(width * height * 3);
  // Studio backdrop: soft vertical gradient, slightly darker at the bottom.
  for (let y = 0; y < height; y += 1) {
    const t = y / height;
    const level = 0.9 - 0.22 * t;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      buf[i] = Math.round(246 * level);
      buf[i + 1] = Math.round(245 * level);
      buf[i + 2] = Math.round(240 * level);
    }
  }

  // A ground plane at y = 0: without it a correctly grounded car looks airborne.
  {
    const far = 40;
    const square = [
      new THREE.Vector3(-far, 0, -far),
      new THREE.Vector3(far, 0, -far),
      new THREE.Vector3(far, 0, far),
      new THREE.Vector3(-far, 0, far),
    ].map(project);
    if (!square.some((p) => p === null)) {
      const screen = square.map((p) => [p!.x, p!.y] as [number, number]);
      // Depth-test the ground per pixel would need a z-buffer; draw it first and
      // let the car paint over it. Two triangles, flat colour, contact shadow.
      // A soft studio floor, a shade darker than the backdrop so the wheels and
      // the underside read as contact rather than as floating.
      const floor: [number, number, number, number] = [0xd8, 0xd6, 0xd0, 1];
      rasterise(buf, width, height, [screen[0]!, screen[1]!, screen[2]!], [floor, floor, floor]);
      rasterise(buf, width, height, [screen[0]!, screen[2]!, screen[3]!], [floor, floor, floor]);
    }
  }

  const triangles = trianglesOf(parts)
    .map((triangle) => {
      const centroid = new THREE.Vector3().add(triangle.p[0]).add(triangle.p[1]).add(triangle.p[2]).multiplyScalar(1 / 3);
      const face = new THREE.Vector3()
        .subVectors(triangle.p[1], triangle.p[0])
        .cross(new THREE.Vector3().subVectors(triangle.p[2], triangle.p[0]));
      if (face.lengthSq() > 0) face.normalize();
      return { triangle, face, depth: centroid.distanceTo(cam.eye) };
    })
    .sort((a, b) => b.depth - a.depth);

  for (const { triangle, face } of triangles) {
    const pts = triangle.p.map(project);
    if (pts.some((p) => p === null)) continue;
    const screen = pts.map((p) => [p!.x, p!.y] as [number, number]);
    // Back faces of a closed shell are not visible, but a whole triangle whose
    // winding faces away can still be drawn by the painter's algorithm; skip it.
    const toEye = new THREE.Vector3().subVectors(cam.eye, triangle.p[0]);
    if (face.dot(toEye) < 0) continue;
    const colours = triangle.n.map((normal) => shade(triangle.key, normal));
    rasterise(buf, width, height, screen, colours);
  }
  return buf;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
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

function writePng(file: string, width: number, height: number, rgb: Uint8Array): void {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
}

function compose(target: { w: number; h: number; buf: Uint8Array }, cells: Array<{ w: number; h: number; buf: Uint8Array; x: number; y: number }>): void {
  for (const cell of cells) {
    for (let y = 0; y < cell.h; y += 1) {
      const to = ((cell.y + y) * target.w + cell.x) * 3;
      const from = y * cell.w * 3;
      Buffer.from(cell.buf.buffer, from, cell.w * 3).copy(Buffer.from(target.buf.buffer), to);
      target.buf.set(cell.buf.subarray(from, from + cell.w * 3), to);
    }
  }
}

/**
 * The revision whose `parts.ts` still described the cars inline.
 *
 * After the loft rework, `parts.ts` imports `car.ts`, so importing an old
 * `parts.ts` would silently pull in the *new* cars. Walk back from the given
 * revision until we find one that does not import the car module.
 */
function beforeRevision(explicit?: string): string {
  const start = explicit && /^[\w.~^-]+$/.test(explicit) ? explicit : (process.env.HAVEN_BEFORE_REV ?? "HEAD");
  let revision = start;
  for (let step = 0; step < 6; step += 1) {
    try {
      const source = execSync(`git show ${revision}:src/lib/3d/parts.ts`, { encoding: "utf8" });
      if (!source.includes('from "./car"')) return revision;
    } catch {
      return start;
    }
    revision = `${revision}~1`;
  }
  return start;
}

/** The previous cars, from git: `carParts` lived inside parts.ts. */
async function beforeParts(): Promise<Record<CarModel, Part[]> | null> {
  try {
    const dir = path.join("src", "lib", "3d");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "parts-before-tmp.ts");
    writeFileSync(file, execSync(`git show ${beforeRevision(process.argv[3])}:src/lib/3d/parts.ts`, { encoding: "utf8" }));
    const modulePath = "../src/lib/3d/parts-before-tmp";
    const mod = (await import(/* webpackIgnore: true */ modulePath)) as unknown as {
      plotParts: (input: unknown) => Part[];
    };
    const out = {} as Record<CarModel, Part[]>;
    // The old props were one body shape; the single bay carried one, the double
    // bay two. Map them onto the new models by bay type.
    const build = (depth: number, bays: 1 | 2) =>
      centreParts(
        mod
          .plotParts({
            code: "CMP",
            rearDepth: 18,
            walls: [],
            garage: { width: bays === 2 ? 5.2 : 3.6, depth, x: 0, z: depth / 2, bays, walled: bays === 2 },
            pool: null,
            seed: 1,
            lowQuality: false,
          })
          .filter((part) => part.group === "car"),
      );
    out.roma = build(5.0, 1);
    out.purosangue = build(5.6, 2);
    out["12cilindri"] = build(5.6, 2);
    rmSync(file, { force: true });
    return out;
  } catch (error) {
    console.warn("previous cars unavailable:", (error as Error).message);
    return null;
  }
}

/** The old cars sat at the carport's bay centre; move them to the origin. */
function centreParts(parts: Part[]): Part[] {
  const merged = mergePartsByMaterial(parts);
  const box = new THREE.Box3();
  for (const geometry of Object.values(merged) as Array<THREE.BufferGeometry | undefined>) {
    if (!geometry) continue;
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  const centre = box.getCenter(new THREE.Vector3());
  return parts.map((part) => ({
    ...part,
    shape: {
      ...part.shape,
      position: [part.shape.position[0] - centre.x, part.shape.position[1], part.shape.position[2] - centre.z] as [number, number, number],
    },
  }));
}

/** Cameras scaled to the car, so a 4.97 m Purosangue and a 4.66 m Roma both fit. */
function viewsFor(length: number): Array<{ name: string; cam: Cam }> {
  const r = length / 4.66;
  const c = (x: number, y: number, z: number) => new THREE.Vector3(x * r, y, z * r);
  return [
    { name: "front 3/4", cam: { eye: c(5.4, 1.75, 5.6), target: new THREE.Vector3(0, 0.72, 0.15), fov: 32 } },
    { name: "side", cam: { eye: c(9.2, 1.05, 0.02), target: new THREE.Vector3(0, 0.72, 0), fov: 27 } },
    { name: "rear 3/4", cam: { eye: c(-5.2, 1.7, -5.4), target: new THREE.Vector3(0, 0.72, -0.15), fov: 32 } },
  ];
}

const CELL_W = 640;
const CELL_H = 470;

async function main() {
  const out = process.argv[2] ?? "docs/cars-before-after.png";
  const before = await beforeParts();

  const styles: CarModel[] = CAR_MODELS;
  const rows: Array<{ style: CarModel; before: Part[] | null; after: Part[] }> = styles.map((style) => ({
    style,
    before: before?.[style] ?? null,
    after: carParts("CMP", 0, 0, PAINT[style], style, 1, false),
  }));

  const w = CELL_W * 2;
  const h = CELL_H * rows.length;
  const target = { w, h, buf: new Uint8Array(w * h * 3).fill(0xf2) };

  const cells: Array<{ w: number; h: number; buf: Uint8Array; x: number; y: number }> = [];
  rows.forEach((row, index) => {
    const cam = viewsFor(carSpec(row.style).length)[0]!.cam;
    if (row.before) cells.push({ ...dim(renderCell(row.before, cam, CELL_W, CELL_H)), x: 0, y: index * CELL_H });
    cells.push({ ...dim(renderCell(row.after, cam, CELL_W, CELL_H)), x: CELL_W, y: index * CELL_H });
  });
  compose(target, cells);
  writePng(out, w, h, target.buf);
  console.log(`wrote ${resolve(out)} ${w} x ${h} (before | after)`);

  // Detail sheet: every model from three angles.
  const dw = CELL_W * 3;
  const dh = CELL_H * styles.length;
  const detail = { w: dw, h: dh, buf: new Uint8Array(dw * dh * 3).fill(0xf2) };
  const detailCells = styles.flatMap((style, index) =>
    viewsFor(carSpec(style).length).map((view, column) => ({
      ...dim(renderCell(carParts("CMP", 0, 0, PAINT[style], style, 1, false), view.cam, CELL_W, CELL_H)),
      x: column * CELL_W,
      y: index * CELL_H,
    })),
  );
  compose(detail, detailCells);
  const detailPath = out.replace(/\.png$/, "-views.png");
  writePng(detailPath, dw, dh, detail.buf);
  console.log(`wrote ${resolve(detailPath)} ${dw} x ${dh} (front 3/4 | side | rear 3/4)`);
}

/** The paint each model is rendered in, matching the plot's three colours. */
const PAINT: Record<CarModel, PartMaterial> = {
  roma: "carPaint0",
  "12cilindri": "carPaint1",
  purosangue: "carPaint2",
};

function dim(buf: Uint8Array): { w: number; h: number; buf: Uint8Array } {
  return { w: CELL_W, h: CELL_H, buf };
}

void main();
