import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DataGateway } from "./gateway";
import { SqliteGateway } from "./sqlite";
import { ensureSeeded } from "./seed";

export type DbDriver = "sqlite" | "supabase";

export function dataRoot(): string {
  return path.resolve(process.env.HAVEN_DATA_DIR || path.join(process.cwd(), ".data"));
}

export function uploadsRoot(): string {
  return path.join(dataRoot(), "uploads");
}

export function hasSupabaseConfig(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
  );
}

export function getDbDriver(): DbDriver {
  const configured = (process.env.HAVEN_DB_DRIVER || "").toLowerCase();
  if (configured === "sqlite" || configured === "supabase") return configured;
  return hasSupabaseConfig() ? "supabase" : "sqlite";
}

declare global {
  var __havenDb: Promise<DataGateway> | undefined;
}

let initialized = false;

async function connect(): Promise<DataGateway> {
  mkdirSync(uploadsRoot(), { recursive: true });

  if (getDbDriver() === "supabase") {
    if (!hasSupabaseConfig()) {
      throw new Error("HAVEN_DB_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    const { SupabaseGateway } = await import("./supabase");
    const gateway = new SupabaseGateway(
      (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)!,
    );
    return gateway;
  }

  const gateway = new SqliteGateway(path.join(dataRoot(), "haven.db"));
  await ensureSeeded(gateway);
  return gateway;
}

/**
 * One gateway per process. Cached on globalThis so Next's dev reloads do not
 * open a new SQLite handle on every request.
 */
export async function getDb(): Promise<DataGateway> {
  if (!globalThis.__havenDb) {
    globalThis.__havenDb = connect().catch((error) => {
      globalThis.__havenDb = undefined;
      throw error;
    });
  }
  const gateway = await globalThis.__havenDb;
  if (process.env.NODE_ENV !== "production") {
    // Apply the DDL once per process for the local driver (idempotent).
    initialized = true;
  }
  return gateway;
}

/** Used by tests and scripts that need a clean handle. */
export async function closeDb(): Promise<void> {
  if (!globalThis.__havenDb) return;
  try {
    const gateway = await globalThis.__havenDb;
    gateway.close?.();
  } finally {
    globalThis.__havenDb = undefined;
    initialized = false;
  }
}

export function __isInitialized(): boolean {
  return initialized;
}
