/**
 * Seed the configured database with the demonstration condominium.
 *
 *   npm run db:seed
 *
 * Local driver: creates .data/haven.db and seeds 13 homes, 3 staff profiles,
 *              8 model assets, photography rows, sample leads and viewings.
 * Supabase:    requires the migrations to have been applied first; the service
 *              role key is used once for seeding.
 *
 * The seed is idempotent: existing properties are never duplicated.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SqliteGateway } from "../src/lib/db/sqlite";
import { ensureSeeded } from "../src/lib/db/seed";

async function main() {
  const dataDir = path.resolve(process.env.HAVEN_DATA_DIR || ".data");
  const driver = process.env.HAVEN_DB_DRIVER || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "sqlite");

  if (driver === "supabase") {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase seeding needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    const { SupabaseGateway } = await import("../src/lib/db/supabase");
    const gateway = new SupabaseGateway(url, key);
    const report = await ensureSeeded(gateway);
    console.log("Seeded Supabase:", report);
    return;
  }

  mkdirSync(dataDir, { recursive: true });
  const gateway = new SqliteGateway(path.join(dataDir, "haven.db"));
  try {
    const report = await ensureSeeded(gateway);
    console.log(`Seeded ${path.join(dataDir, "haven.db")}`);
    console.log(
      [
        `properties: ${report.properties}`,
        `profiles:   ${report.profiles}`,
        `leads:      ${report.leads}`,
        `visits:     ${report.visits}`,
        `media:      ${report.media}`,
        report.skippedBecausePopulated ? "skipped: database already populated" : "seeded: demo data inserted",
      ].join("\n"),
    );
  } finally {
    gateway.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
