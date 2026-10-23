import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SQLITE_DDL, TABLES, assertColumn, type TableName } from "./schema";
import type { DataGateway, FilterValue, QueryOptions, Row } from "./gateway";

function serialize(table: TableName, row: Row): Row {
  const jsonColumns = TABLES[table].json as readonly string[];
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (jsonColumns.includes(key)) {
      out[key] = value === null ? null : JSON.stringify(value);
    } else if (typeof value === "boolean") {
      out[key] = value ? 1 : 0;
    } else {
      out[key] = value as never;
    }
  }
  return out;
}

function deserialize(table: TableName, row: Row): Row {
  const jsonColumns = TABLES[table].json as readonly string[];
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (jsonColumns.includes(key) && typeof value === "string") {
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = null;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

interface SqlFragment {
  sql: string;
  params: Array<string | number | null>;
}

function buildWhere(table: TableName, where?: Record<string, FilterValue>): SqlFragment {
  if (!where || Object.keys(where).length === 0) return { sql: "", params: [] };
  const clauses: string[] = [];
  const params: Array<string | number | null> = [];
  for (const [column, raw] of Object.entries(where)) {
    assertColumn(table, column);
    const col = `"${column}"`;
    if (raw === null) {
      clauses.push(`${col} IS NULL`);
      continue;
    }
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const op = raw as Exclude<FilterValue, unknown>;
      const o = op as Record<string, unknown>;
      if ("eq" in o) {
        clauses.push(`${col} = ?`);
        params.push(o.eq as string | number | null);
      }
      if ("neq" in o) {
        clauses.push(`${col} <> ?`);
        params.push(o.neq as string | number | null);
      }
      if ("in" in o) {
        const list = (o.in as unknown[]) ?? [];
        if (list.length === 0) {
          clauses.push("1 = 0");
        } else {
          clauses.push(`${col} IN (${list.map(() => "?").join(",")})`);
          for (const item of list) params.push(item as string | number | null);
        }
      }
      if ("gte" in o) {
        clauses.push(`${col} >= ?`);
        params.push(o.gte as string | number);
      }
      if ("lte" in o) {
        clauses.push(`${col} <= ?`);
        params.push(o.lte as string | number);
      }
      if ("gt" in o) {
        clauses.push(`${col} > ?`);
        params.push(o.gt as string | number);
      }
      if ("lt" in o) {
        clauses.push(`${col} < ?`);
        params.push(o.lt as string | number);
      }
      if (o.isNull === true) clauses.push(`${col} IS NULL`);
      if (o.notNull === true) clauses.push(`${col} IS NOT NULL`);
      continue;
    }
    clauses.push(`${col} = ?`);
    params.push(raw as string | number | null);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

export class SqliteGateway implements DataGateway {
  readonly driver = "sqlite" as const;
  private db: DatabaseSync;
  private depth = 0;

  constructor(filename: string) {
    mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.db.exec(SQLITE_DDL);
  }

  async select(table: TableName, options: QueryOptions = {}): Promise<Row[]> {
    const where = buildWhere(table, options.where);
    const order = (options.orderBy ?? [])
      .map((o) => {
        assertColumn(table, o.column);
        return `"${o.column}" ${o.ascending === false ? "DESC" : "ASC"}`;
      })
      .join(", ");
    const limit = options.limit !== undefined ? ` LIMIT ${Math.max(0, Math.floor(options.limit))}` : "";
    const offset = options.offset ? ` OFFSET ${Math.max(0, Math.floor(options.offset))}` : "";
    const columns = options.columns
      ? options.columns
          .split(",")
          .map((c) => {
            const trimmed = c.trim();
            assertColumn(table, trimmed);
            return `"${trimmed}"`;
          })
          .join(", ")
      : "*";
    const sql = `SELECT ${columns} FROM "${table}"${where.sql}${order ? ` ORDER BY ${order}` : ""}${limit}${offset}`;
    const rows = this.db.prepare(sql).all(...where.params) as Row[];
    return rows.map((row) => deserialize(table, row));
  }

  async insert(table: TableName, row: Row): Promise<Row> {
    const data = serialize(table, row);
    for (const key of Object.keys(data)) assertColumn(table, key);
    const columns = Object.keys(data);
    if (columns.length === 0) throw new Error(`Cannot insert empty row into ${table}`);
    const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES (${columns
      .map(() => "?")
      .join(",")})`;
    this.db.prepare(sql).run(...(Object.values(data) as Array<string | number | null>));
    const pk = TABLES[table].primaryKey;
    const pkValue = data[pk];
    const inserted = await this.select(table, { where: { [pk]: pkValue }, limit: 1 });
    return inserted[0] ?? data;
  }

  async update(table: TableName, where: Record<string, FilterValue>, patch: Row): Promise<Row[]> {
    const data = serialize(table, patch);
    const columns = Object.keys(data);
    if (columns.length === 0) return [];
    for (const key of columns) assertColumn(table, key);
    const w = buildWhere(table, where);
    const sql = `UPDATE "${table}" SET ${columns.map((c) => `"${c}" = ?`).join(", ")}${w.sql}`;
    this.db.prepare(sql).run(...([...Object.values(data), ...w.params] as Array<string | number | null>));
    return this.select(table, { where });
  }

  async remove(table: TableName, where: Record<string, FilterValue>): Promise<number> {
    const w = buildWhere(table, where);
    if (!w.sql) throw new Error("Refusing to delete without a WHERE clause");
    const result = this.db.prepare(`DELETE FROM "${table}"${w.sql}`).run(...w.params);
    return Number(result.changes ?? 0);
  }

  async count(table: TableName, where?: Record<string, FilterValue>): Promise<number> {
    const w = buildWhere(table, where);
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM "${table}"${w.sql}`).get(...w.params) as { n: number };
    return Number(row.n);
  }

  async transaction<T>(fn: (tx: DataGateway) => Promise<T>): Promise<T> {
    if (this.depth > 0) return fn(this);
    this.db.exec("BEGIN IMMEDIATE");
    this.depth += 1;
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore rollback failure */
      }
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  async rpc<T>(name: string, _args: Record<string, unknown>): Promise<T> {
    throw new Error(`RPC ${name} is not implemented by the SQLite driver`);
  }

  close(): void {
    this.db.close();
  }
}
