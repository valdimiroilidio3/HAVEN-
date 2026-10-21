import type { DashboardMetrics, Lead, Property, PropertyPosition, PropertyStatus, Typology, VisitRequest } from "./types";
import { TYPOLOGIES } from "./types";

/** Compute dashboard metrics from persisted rows (never hardcoded). */
export function computeDashboardMetrics(input: {
  properties: Property[];
  leads: Lead[];
  visits: VisitRequest[];
  positions: PropertyPosition[];
}): DashboardMetrics {
  const { properties, leads, visits, positions } = input;
  const active = properties.filter((p) => p.publication !== "archived");
  const statusBreakdown = { available: 0, reserved: 0, sold: 0, hidden: 0 } as Record<PropertyStatus, number>;
  for (const p of active) statusBreakdown[p.status] += 1;

  const typologyBreakdown = Object.fromEntries(TYPOLOGIES.map((t) => [t, 0])) as Record<Typology, number>;
  for (const p of active) typologyBreakdown[p.typology] += 1;

  const sceneDraftPending = positions.some(
    (pos) =>
      Math.abs(pos.x - pos.publishedX) > 0.001 ||
      Math.abs(pos.z - pos.publishedZ) > 0.001 ||
      Math.abs(pos.rotationY - pos.publishedRotationY) > 0.001,
  );

  return {
    totalProperties: active.length,
    available: statusBreakdown.available,
    reserved: statusBreakdown.reserved,
    sold: statusBreakdown.sold,
    unpublished: active.filter((p) => p.publication !== "published").length,
    newLeads: leads.filter((l) => l.status === "new").length,
    pendingVisits: visits.filter((v) => v.status === "requested").length,
    totalLeads: leads.filter((l) => l.status !== "archived").length,
    typologyBreakdown,
    statusBreakdown,
    sceneDraftPending,
  };
}

export function visitStatusPriority(status: VisitRequest["status"]): number {
  return { requested: 0, confirmed: 1, rescheduled: 2, completed: 3, cancelled: 4 }[status];
}
