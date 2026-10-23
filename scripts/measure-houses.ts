/**
 * Cost of a house, before and after the presentation work.
 *   npx tsx scripts/measure-houses.ts
 */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BufferGeometry } from "three";
import { getFloorPlan } from "../src/lib/domain/floorplans";
import { HOUSE_CONFIG, buildHouseGeometry } from "../src/components/three/house-geometry";

function cost(set: Record<string, BufferGeometry | undefined>) {
  let tris = 0;
  let calls = 0;
  for (const g of Object.values(set)) {
    if (!g) continue;
    calls += 1;
    const pos = g.getAttribute("position");
    const idx = g.getIndex();
    tris += (idx ? idx.count : pos.count) / 3;
  }
  return { calls, tris: Math.round(tris) };
}

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

async function main() {
  const lines: string[] = [];
  let callsAfter = 0;
  let trisAfter = 0;
  for (const t of ["T1", "T2", "T3", "T4"]) {
    const c = cost(buildHouseGeometry(getFloorPlan(t as never), HOUSE_CONFIG[t]!, 7));
    callsAfter += c.calls;
    trisAfter += c.tris;
    lines.push(`after  ${t}: ${c.calls} draw calls, ${c.tris} triangles`);
  }

  const file = writeBeforeModule("src/components/three/house-geometry.ts", "house-geometry-before", process.argv[2]);
  const mod = (await import(/* webpackIgnore: true */ pathToFileURL(resolve(file)).href)) as unknown as {
    buildHouseGeometry: typeof buildHouseGeometry;
    HOUSE_CONFIG: typeof HOUSE_CONFIG;
  };
  let callsBefore = 0;
  let trisBefore = 0;
  for (const t of ["T1", "T2", "T3", "T4"]) {
    const c = cost(mod.buildHouseGeometry(getFloorPlan(t as never), mod.HOUSE_CONFIG[t]!, 7));
    callsBefore += c.calls;
    trisBefore += c.tris;
    lines.push(`before ${t}: ${c.calls} draw calls, ${c.tris} triangles`);
  }
  rmSync("scripts/.cache", { recursive: true, force: true });
  lines.push("");
  lines.push(`total after : ${callsAfter} draw calls, ${trisAfter} triangles (4 prototypes)`);
  lines.push(`total before: ${callsBefore} draw calls, ${trisBefore} triangles`);
  lines.push(`delta       : ${callsAfter - callsBefore > 0 ? "+" : ""}${callsAfter - callsBefore} draw calls, ${trisAfter - trisBefore} triangles`);
  lines.push(`per house   : +${((trisAfter - trisBefore) / 4).toFixed(0)} triangles`);
  console.log(lines.join("\n"));
}

void main();
