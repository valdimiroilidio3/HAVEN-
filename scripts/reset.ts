/**
 * Reset the LOCAL SQLite database and re-seed the demo content.
 *
 *   HAVEN_CONFIRM_RESET=yes npm run db:reset
 *
 * This deletes .data/haven.db (and its WAL files) plus uploaded files under
 * .data/uploads. It refuses to run against Supabase and requires the explicit
 * confirmation variable, so it cannot be triggered by accident.
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function main() {
  if (process.env.HAVEN_DB_DRIVER === "supabase") {
    throw new Error("Refusing to reset a Supabase database. Drop the schema manually if this is intentional.");
  }
  if (process.env.HAVEN_CONFIRM_RESET !== "yes") {
    throw new Error("Refusing to reset without HAVEN_CONFIRM_RESET=yes.");
  }

  const dataDir = path.resolve(process.env.HAVEN_DATA_DIR || ".data");
  for (const file of ["haven.db", "haven.db-wal", "haven.db-shm"]) {
    const target = path.join(dataDir, file);
    if (existsSync(target)) rmSync(target, { force: true });
  }
  rmSync(path.join(dataDir, "uploads"), { recursive: true, force: true });
  console.log(`Removed ${dataDir}`);

  const seed = spawnSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
  if (seed.status !== 0) process.exitCode = seed.status ?? 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
