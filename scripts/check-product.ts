/**
 * Product-level functional check over HTTP.
 *
 * The 3D scene needs a GPU browser that this environment does not have, but the
 * rest of the product does not: every public route, every residence page and the
 * admin gate can be checked exactly as a visitor would. This script walks them,
 * asserts status codes, looks for data that leaked into the markup as `NaN` or
 * `undefined`, and prints a table.
 *
 *   npx tsx scripts/check-product.ts [baseUrl]
 */
import { SEED_UNITS, slugFor } from "../src/lib/domain/inventory";

const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const anomalies = /NaN|undefined(?:&|€|,|\.|\s|$)|\[object Object\]|Infinity/;

type Row = { route: string; status: number; ok: boolean; note: string };
const rows: Row[] = [];

async function check(route: string, expectations: { status?: number; must?: string[]; redirectTo?: string } = {}): Promise<void> {
  const url = `${base}${route}`;
  let status = 0;
  let body = "";
  let location = "";
  try {
    const response = await fetch(url, { redirect: "manual" });
    status = response.status;
    location = response.headers.get("location") ?? "";
    body = await response.text();
  } catch (error) {
    rows.push({ route, status: 0, ok: false, note: `fetch failed: ${(error as Error).message}` });
    return;
  }
  const expected = expectations.status ?? 200;
  const problems: string[] = [];
  if (status !== expected) problems.push(`expected ${expected}, got ${status}`);
  if (expectations.redirectTo && !location.includes(expectations.redirectTo)) problems.push(`redirected to ${location || "nowhere"}`);
  if (status === 200) {
    if (anomalies.test(body)) problems.push("markup contains NaN/undefined");
    for (const needle of expectations.must ?? []) {
      if (!body.includes(needle)) problems.push(`missing “${needle}”`);
    }
  }
  rows.push({ route, status, ok: problems.length === 0, note: problems.join("; ") || "ok" });
}

async function main(): Promise<void> {
await check("/", { must: ["HAVEN", "condominium"] });
await check("/properties", { must: ["Availability", "€"] });
await check("/visit", { must: ["<form"] });
await check("/login", { must: ["<form"] });
await check("/admin", { status: 307, redirectTo: "/login" });
await check("/admin/settings", { status: 307, redirectTo: "/login" });
await check("/api/admin/leads/export", { status: 401 });

let residenceFailures = 0;
for (const unit of SEED_UNITS) {
  const slug = slugFor(unit.code, unit.title);
  const response = await fetch(`${base}/properties/${slug}`, { redirect: "manual" });
  const body = response.status === 200 ? await response.text() : "";
  // The seed keeps two units unpublished on purpose (an admin workflow needs
  // drafts); for a visitor those pages must be absent, not broken.
  const publicUnit = unit.publication === "published" && unit.status !== "hidden";
  const expectedStatus = publicUnit ? 200 : 404;
  const ok =
    response.status === expectedStatus &&
    (!publicUnit || (body.includes(unit.code) && body.includes("€") && !anomalies.test(body)));
  if (!ok) residenceFailures += 1;
  rows.push({
    route: `/properties/${slug}`,
    status: response.status,
    ok,
    note: ok ? (publicUnit ? "ok" : "hidden from the public, as seeded") : `expected ${expectedStatus}`,
  });
}

const width = Math.max(...rows.map((row) => row.route.length)) + 2;
for (const row of rows) {
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.route.padEnd(width)} ${String(row.status).padEnd(4)} ${row.note}`);
}
const failed = rows.filter((row) => !row.ok).length;
console.log(`\n${rows.length - failed}/${rows.length} checks passed · ${SEED_UNITS.length} residences · base ${base}`);
if (residenceFailures > 0) console.log(`${residenceFailures} residence pages failed`);
process.exitCode = failed > 0 ? 1 : 0;
}

void main();
