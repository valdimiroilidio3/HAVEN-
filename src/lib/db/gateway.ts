import type { TableName } from "./schema";

export type Row = Record<string, unknown>;

/**
 * Equality, or a small operator object used by the shared query builders:
 *   { status: "available" }              → status = ?
 *   { expires_at: { lt: nowIso() } }     → expires_at < ?
 *   { photo: { isNull: true } }          → photo IS NULL
 *
 * Rows crossing the gateway are untyped records, so filter values stay loose on
 * purpose: every identifier is validated against the schema allowlist instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FilterValue = any;

export interface QueryOptions {
  where?: Record<string, FilterValue>;
  orderBy?: Array<{ column: string; ascending?: boolean }>;
  limit?: number;
  offset?: number;
  /** Comma-separated column allowlist. */
  columns?: string;
}

/**
 * Storage-agnostic data access. Both drivers implement exactly this surface so
 * repositories never branch on the backend.
 */
export interface DataGateway {
  readonly driver: "sqlite" | "supabase";
  select(table: TableName, options?: QueryOptions): Promise<Row[]>;
  insert(table: TableName, row: Row): Promise<Row>;
  update(table: TableName, where: Record<string, FilterValue>, patch: Row): Promise<Row[]>;
  remove(table: TableName, where: Record<string, FilterValue>): Promise<number>;
  count(table: TableName, where?: Record<string, FilterValue>): Promise<number>;
  transaction<T>(fn: (tx: DataGateway) => Promise<T>): Promise<T>;
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
  close?(): void;
}
