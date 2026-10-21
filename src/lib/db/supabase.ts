import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DataGateway, FilterValue, QueryOptions, Row } from "./gateway";
import { TABLES, assertColumn, type TableName } from "./schema";

/**
 * Supabase driver — server only.
 *
 * Uses the SERVICE ROLE key, which must never reach the browser. All browser
 * access is mediated by server actions / route handlers that authenticate the
 * session and authorise the operation first. RLS policies in
 * supabase/migrations/0002_rls.sql protect the anon/authenticated keys.
 *
 * NOTE: this driver could not be exercised in the delivery environment because
 * no Supabase project credentials were available. The integration boundary is
 * complete and documented; treat remote persistence as unverified until you run
 * the SQL migrations against a real project.
 */
export class SupabaseGateway implements DataGateway {
  readonly driver = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "x-haven-driver": "server" } },
    });
  }

  private table(name: TableName) {
    return this.client.from(name);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilters(query: any, table: TableName, where?: Record<string, FilterValue>) {
    let q = query;
    if (!where) return q;
    for (const [column, raw] of Object.entries(where)) {
      assertColumn(table, column);
      if (raw === null) {
        q = q.is(column, null);
        continue;
      }
      if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        if ("eq" in o) q = q.eq(column, o.eq);
        if ("neq" in o) q = q.neq(column, o.neq);
        if ("in" in o) q = q.in(column, (o.in as unknown[]) ?? []);
        if ("gte" in o) q = q.gte(column, o.gte);
        if ("lte" in o) q = q.lte(column, o.lte);
        if ("gt" in o) q = q.gt(column, o.gt);
        if ("lt" in o) q = q.lt(column, o.lt);
        if (o.isNull === true) q = q.is(column, null);
        if (o.notNull === true) q = q.not(column, "is", null);
        continue;
      }
      q = q.eq(column, raw);
    }
    return q;
  }

  async select(table: TableName, options: QueryOptions = {}): Promise<Row[]> {
    let query = this.table(table).select(options.columns ?? "*");
    query = this.applyFilters(query, table, options.where);
    for (const order of options.orderBy ?? []) {
      assertColumn(table, order.column);
      query = query.order(order.column, { ascending: order.ascending !== false });
    }
    if (options.limit !== undefined) {
      const from = options.offset ?? 0;
      query = query.range(from, from + Math.max(0, options.limit) - 1);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase select ${table}: ${error.message}`);
    return (data ?? []) as unknown as Row[];
  }

  async insert(table: TableName, row: Row): Promise<Row> {
    const { data, error } = await this.table(table).insert(row).select("*").single();
    if (error) throw new Error(`Supabase insert ${table}: ${error.message}`);
    return data as Row;
  }

  async update(table: TableName, where: Record<string, FilterValue>, patch: Row): Promise<Row[]> {
    let query = this.table(table).update(patch);
    query = this.applyFilters(query, table, where);
    const { data, error } = await query.select("*");
    if (error) throw new Error(`Supabase update ${table}: ${error.message}`);
    return (data ?? []) as Row[];
  }

  async remove(table: TableName, where: Record<string, FilterValue>): Promise<number> {
    if (!where || Object.keys(where).length === 0) throw new Error("Refusing to delete without filters");
    let query = this.table(table).delete();
    query = this.applyFilters(query, table, where);
    const { data, error } = await query.select("id");
    if (error) throw new Error(`Supabase delete ${table}: ${error.message}`);
    return (data ?? []).length;
  }

  async count(table: TableName, where?: Record<string, FilterValue>): Promise<number> {
    let query = this.table(table).select("*", { count: "exact", head: true });
    query = this.applyFilters(query, table, where);
    const { count, error } = await query;
    if (error) throw new Error(`Supabase count ${table}: ${error.message}`);
    return count ?? 0;
  }

  /**
   * HTTP requests cannot share a transaction. Multi-write invariants are
   * implemented as Postgres functions and invoked through rpc(); this fallback
   * exists only for sequential operations that are safe to retry.
   */
  async transaction<T>(fn: (tx: DataGateway) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new Error(`Supabase rpc ${name}: ${error.message}`);
    return data as T;
  }

  /** Upload a binary asset to Storage using the service role. */
  async upload(bucket: string, path: string, body: ArrayBuffer, contentType: string): Promise<string> {
    const { error } = await this.client.storage.from(bucket).upload(path, body, { contentType, upsert: false });
    if (error) throw new Error(`Supabase storage upload: ${error.message}`);
    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  rawClient(): SupabaseClient {
    return this.client;
  }
}

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function tableColumns(table: TableName): readonly string[] {
  return TABLES[table].columns;
}
