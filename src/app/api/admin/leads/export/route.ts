import { getDb } from "@/lib/db";
import { listLeads, listProperties } from "@/lib/db/repositories";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/constants";

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** CSV export of the lead pipeline. Requires an authenticated admin or manager. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!can(session.user.role, "content:read")) return new Response("Forbidden", { status: 403 });

  const db = await getDb();
  const [result, properties] = await Promise.all([
    listLeads(db, { pageSize: 1000 }),
    listProperties(db, { includeArchived: true, pageSize: 200 }),
  ]);
  const titles = new Map(properties.rows.map((property) => [property.id, property.code]));

  const header = ["code", "name", "email", "phone", "home", "typology", "source", "status", "consent", "message", "created_at", "retention_until"];
  const lines = [header.map(csvCell).join(",")];
  for (const lead of result.rows) {
    lines.push(
      [
        lead.id,
        lead.name,
        lead.email,
        lead.phone,
        lead.propertyId ? titles.get(lead.propertyId) ?? "" : "",
        lead.typology,
        lead.source,
        lead.status,
        lead.consent,
        lead.message,
        lead.createdAt,
        lead.retentionUntil,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="haven-leads-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
