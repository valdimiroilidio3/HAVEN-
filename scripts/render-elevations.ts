/**
 * Offline architectural elevations.
 *
 * There is no GPU in this environment, so a browser screenshot is not available.
 * This renders the **real merged geometry** that the scene draws — the same
 * `buildHouseGeometry` output, triangle for triangle — with a deterministic
 * orthographic camera and flat shading. It is not a beauty render: it is an
 * elevation, and that is exactly what is needed to judge sills, soffits, the
 * plinth contact, whether the canopy is supported and whether the roof sits on
 * the walls.
 *
 *   npx tsx scripts/render-elevations.ts [out.png]
 *
 * The "before" column is built from the previous commit's builder, pulled with
 * `git show` into a temporary module, so the comparison is of real code rather
 * than of a remembered description.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { getFloorPlan } from "../src/lib/domain/floorplans";
import { HOUSE_CONFIG, buildHouseGeometry, type HouseGeometrySet } from "../src/components/three/house-geometry";

const SCALE = 34; // pixels per metre
const PAD = 26;
const GAP = 26;

type Mode = "front" | "threeQuarter";

const COLORS: Record<string, [number, number, number, number]> = {
  stone: [0xcf, 0xc7, 0xb6, 1],
  render: [0xe7, 0xe3, 0xd7, 1],
  concrete: [0xd4, 0xce, 0xc1, 1],
  charcoal: [0x2f, 0x31, 0x2a, 1],
  metal: [0x2a, 0x2c, 0x27, 1],
  timber: [0xa9, 0x84, 0x62, 1],
  timberDark: [0x55, 0x40, 0x2c, 1],
  deck: [0xb0, 0x8a, 0x61, 1],
  gravel: [0xce, 0xc6, 0xb2, 1],
  interior: [0x15, 0x16, 0x12, 1],
  glass: [0x4c, 0x6b, 0x6a, 0.55],
  glassRail: [0xae, 0xbd, 0xb7, 0.3],
};

const LIGHT = new THREE.Vector3(-0.45, 0.78, 0.62).normalize();

interface Triangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  key: string;
}

function triangles(set: HouseGeometrySet): Triangle[] {
  const out: Triangle[] = [];
  for (const [key, geometry] of Object.entries(set) as Array<[string, THREE.BufferGeometry]>) {
    if (!geometry) continue;
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      out.push({
        a: new THREE.Vector3().fromBufferAttribute(position, ia),
        b: new THREE.Vector3().fromBufferAttribute(position, ib),
        c: new THREE.Vector3().fromBufferAttribute(position, ic),
        key,
      });
    }
  }
  return out;
}

/** Project a triangle into screen space (x, y) plus a depth for sorting. */
function project(triangle: Triangle, mode: Mode): { pts: Array<[number, number]>; depth: number; normal: THREE.Vector3 } {
  const yaw = mode === "threeQuarter" ? (34 * Math.PI) / 180 : 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const map = (v: THREE.Vector3) => {
    const x = v.x * cos - v.z * sin;
    const z = v.x * sin + v.z * cos;
    return { x, y: v.y, z };
  };
  const a = map(triangle.a);
  const b = map(triangle.b);
  const c = map(triangle.c);
  const normal = new THREE.Vector3()
    .subVectors(new THREE.Vector3(b.x, b.y, b.z), new THREE.Vector3(a.x, a.y, a.z))
    .cross(new THREE.Vector3().subVectors(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(a.x, a.y, a.z)));
  if (normal.lengthSq() > 0) normal.normalize();
  return {
    pts: [
      [a.x, a.y],
      [b.x, b.y],
      [c.x, c.y],
    ],
    depth: (a.z + b.z + c.z) / 3,
    normal,
  };
}

function shade(key: string, normal: THREE.Vector3): [number, number, number, number] {
  const base = COLORS[key] ?? [128, 128, 128, 1];
  // Orient the normal toward the viewer so back faces are not black.
  const n = normal.clone();
  if (n.z < 0) n.multiplyScalar(-1);
  const lambert = Math.max(0, n.dot(LIGHT));
  const light = 0.52 + 0.48 * lambert;
  return [base[0] * light, base[1] * light, base[2] * light, base[3]];
}

/** One elevation cell: returns a rect of pixels and its size. */
function renderCell(set: HouseGeometrySet, mode: Mode): { w: number; h: number; buf: Uint8Array } {
  const tris = triangles(set)
    .map((triangle) => ({ ...project(triangle, mode), key: triangle.key }))
    .sort((a, b) => a.depth - b.depth);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = 0;
  let maxY = -Infinity;
  for (const tri of tris) {
    for (const [x, y] of tri.pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const w = Math.ceil((maxX - minX) * SCALE) + PAD * 2;
  const h = Math.ceil((maxY - minY) * SCALE) + PAD * 2;
  const buf = new Uint8Array(w * h * 3).fill(0xf2);
  // Paper background with a faint ground band.
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = 0xf4;
    buf[i + 1] = 0xf3;
    buf[i + 2] = 0xef;
  }
  const originX = PAD - minX * SCALE;
  const originY = h - PAD + minY * SCALE;

  for (const tri of tris) {
    const [r, g, b, alpha] = shade(tri.key, tri.normal);
    const pts = tri.pts.map(([x, y]) => [originX + x * SCALE, originY - y * SCALE] as [number, number]);
    rasterise(buf, w, h, pts, r, g, b, alpha);
  }

  // Ground line at y = 0, so the plinth contact is readable.
  const groundY = Math.round(originY);
  for (let x = 0; x < w; x += 1) {
    const i = (groundY * w + x) * 3;
    if (groundY >= 0 && groundY < h) {
      buf[i] = 0x9a;
      buf[i + 1] = 0x9a;
      buf[i + 2] = 0x92;
    }
  }
  return { w, h, buf };
}

function rasterise(
  buf: Uint8Array,
  w: number,
  h: number,
  pts: Array<[number, number]>,
  r: number,
  g: number,
  b: number,
  alpha: number,
): void {
  const minX = Math.max(0, Math.floor(Math.min(pts[0]![0], pts[1]![0], pts[2]![0])));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(pts[0]![0], pts[1]![0], pts[2]![0])));
  const minY = Math.max(0, Math.floor(Math.min(pts[0]![1], pts[1]![1], pts[2]![1])));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(pts[0]![1], pts[1]![1], pts[2]![1])));
  const area = edge(pts[0]!, pts[1]!, pts[2]!);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const p: [number, number] = [x + 0.5, y + 0.5];
      const w0 = edge(pts[1]!, pts[2]!, p) / area;
      const w1 = edge(pts[2]!, pts[0]!, p) / area;
      const w2 = edge(pts[0]!, pts[1]!, p) / area;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const i = (y * w + x) * 3;
      buf[i] = Math.round(buf[i]! * (1 - alpha) + r * alpha);
      buf[i + 1] = Math.round(buf[i + 1]! * (1 - alpha) + g * alpha);
      buf[i + 2] = Math.round(buf[i + 2]! * (1 - alpha) + b * alpha);
    }
  }
}

function edge(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/* ── PNG encoding ─────────────────────────────────────────────────────── */

function crc32(buffer: Buffer): number {
  let c = ~0;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
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

function writePng(path: string, w: number, h: number, buf: Uint8Array): void {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(buf.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/* ── Composition: before | after, per typology ────────────────────────── */

type Builder = (typology: string) => HouseGeometrySet;

/**
 * The previous builder, pulled from git at run time.
 *
 * The temporary module is written into `scripts/.cache/` and imported through a
 * URL computed at run time (and `webpackIgnore`), because a literal specifier in
 * the source makes the bundler try to resolve a file that only exists while the
 * script runs — which is exactly how a dev server ends up failing to compile.
 */
function beforeRevision(explicit?: string): string {
  if (explicit && /^[\w.~^-]+$/.test(explicit)) return explicit;
  return process.env.HAVEN_BEFORE_REV ?? "HEAD~1";
}

function writeBeforeModule(sourcePath: string, moduleName: string, revision?: string): string {
  const dir = path.join("scripts", ".cache");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${moduleName}.ts`);
  writeFileSync(file, execSync(`git show ${beforeRevision(revision)}:${sourcePath}`, { encoding: "utf8" }));
  return file;
}

async function beforeBuilder(): Promise<Builder | null> {
  try {
    // argv[2] is the output image; the git revision, when given, is argv[3].
    const file = writeBeforeModule("src/components/three/house-geometry.ts", "house-geometry-before", process.argv[3]);
    // Computed at run time: the bundler never sees a path it can try to resolve.
    const module = (await import(/* webpackIgnore: true */ pathToFileURL(resolve(file)).href)) as {
      buildHouseGeometry: (plan: ReturnType<typeof getFloorPlan>, config: unknown, seed: number) => HouseGeometrySet;
      HOUSE_CONFIG: typeof HOUSE_CONFIG;
    };
    return (typology: string) => module.buildHouseGeometry(getFloorPlan(typology as never), module.HOUSE_CONFIG[typology]!, 7);
  } catch (error) {
    console.warn("previous builder unavailable:", (error as Error).message);
    return null;
  }
}

async function main() {
  const out = resolve(process.argv[2] ?? "docs/houses-before-after.png");
  const types = ["T1", "T2", "T3", "T4"];
  const before = await beforeBuilder();
  const after: Builder = (typology) => buildHouseGeometry(getFloorPlan(typology as never), HOUSE_CONFIG[typology]!, 7);

  for (const mode of ["front", "threeQuarter"] as const) {
    const rows: Array<{ label: string; cells: Array<{ w: number; h: number; buf: Uint8Array }> }> = [];
    for (const typology of types) {
      const cells = [];
      if (before) cells.push(renderCell(before(typology), mode));
      cells.push(renderCell(after(typology), mode));
      rows.push({ label: typology, cells });
    }

    const W = Math.max(...rows.map((row) => row.cells.reduce((sum, cell) => sum + cell.w + GAP, 0))) + GAP;
    const H = rows.reduce((sum, row) => sum + Math.max(...row.cells.map((cell) => cell.h)) + GAP, 0) + GAP;
    const canvas = new Uint8Array(W * H * 3).fill(0xfa);
    for (let i = 0; i < canvas.length; i += 3) {
      canvas[i] = 0xfa;
      canvas[i + 1] = 0xf9;
      canvas[i + 2] = 0xf5;
    }

    let cursorY = GAP;
    for (const row of rows) {
      let cursorX = GAP;
      const rowH = Math.max(...row.cells.map((cell) => cell.h));
      for (const cell of row.cells) {
        for (let y = 0; y < cell.h; y += 1) {
          for (let x = 0; x < cell.w; x += 1) {
            const src = (y * cell.w + x) * 3;
            const dst = ((cursorY + y) * W + cursorX + x) * 3;
            if (cursorY + y >= H || cursorX + x >= W) continue;
            canvas[dst] = cell.buf[src]!;
            canvas[dst + 1] = cell.buf[src + 1]!;
            canvas[dst + 2] = cell.buf[src + 2]!;
          }
        }
        cursorX += cell.w + GAP;
      }
      cursorY += rowH + GAP;
      void row.label;
    }

    const suffix = mode === "front" ? "" : "-three-quarter";
    const target = out.replace(/\.png$/, `${suffix}.png`);
    writePng(target, W, H, canvas);
    console.log("wrote", target, `${W} x ${H}`, before ? "(before | after)" : "(after only)");
  }

  const cache = join("scripts", ".cache");
  if (existsSync(cache)) rmSync(cache, { recursive: true, force: true });
}

void main();
