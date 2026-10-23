import { randomUUID } from "node:crypto";
import type { DataGateway } from "./gateway";
import { DEMO_GALLERY, DEMO_SETTINGS, SEED_LEADS, SEED_UNITS, SEED_VISITS, slugFor, unitName } from "@/lib/domain/inventory";
import type { PropertyStatus, Typology } from "@/lib/domain/types";
import { getFloorPlan } from "@/lib/domain/floorplans";
import { hashPassword } from "@/lib/auth/password";

/**
 * Idempotent seed. Safe to run repeatedly:
 *  - profile rows are keyed by email,
 *  - settings are keyed by name,
 *  - the 13 properties are created only when the inventory is empty.
 *
 * It never overwrites an administrator's edits.
 */

export interface SeedReport {
  seeded: boolean;
  properties: number;
  profiles: number;
  leads: number;
  visits: number;
  media: number;
  skippedBecausePopulated: boolean;
}

const nowIso = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const TYPOLOGY_ORDER: Record<Typology, number> = { T1: 0, T2: 1, T3: 2, T4: 3 };

async function ensureProfiles(db: DataGateway): Promise<number> {
  const existing = await db.select("profiles");
  if (existing.length > 0) return 0;
  const adminEmail = (process.env.HAVEN_SEED_ADMIN_EMAIL || "admin@haven.pt").toLowerCase();
  const adminPassword = process.env.HAVEN_SEED_ADMIN_PASSWORD || "Haven!2026";
  const seeds = [
    { email: adminEmail, name: "Haven Administrator", role: "admin" as const, password: adminPassword },
    { email: "manager@haven.pt", name: "Haven Manager", role: "manager" as const, password: "Manager!2026" },
    { email: "viewer@haven.pt", name: "Haven Read-only", role: "viewer" as const, password: "Viewer!2026" },
  ];
  for (const seed of seeds) {
    await db.insert("profiles", {
      id: randomUUID(),
      email: seed.email,
      full_name: seed.name,
      role: seed.role,
      is_active: 1,
      password_hash: hashPassword(seed.password),
      created_at: nowIso(),
      last_seen_at: null,
    });
  }
  return seeds.length;
}

async function ensureSettings(db: DataGateway): Promise<void> {
  const existing = await db.select("app_settings", { where: { key: "app" }, limit: 1 });
  if (existing.length > 0) return;
  await db.insert("app_settings", {
    key: "app",
    value: { ...DEMO_SETTINGS, scenePublishedAt: nowIso(), scenePublishedBy: null },
    updated_at: nowIso(),
    updated_by: null,
  });
}

async function ensureAssets(db: DataGateway): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const rolePrefix = { exterior: "EXT", interior: "INT", floorplan: "PLAN", site: "SITE" } as const;
  const typologies: Typology[] = ["T1", "T2", "T3", "T4"];
  for (const typology of typologies) {
    const plan = getFloorPlan(typology);
    for (const role of ["exterior", "interior", "floorplan"] as const) {
      const id = randomUUID();
      const code = `HAVEN-${rolePrefix[role]}-${typology}`;
      const existing = await db.select("model_assets", { where: { code }, limit: 1 });
      if (existing[0]) {
        map[code] = String(existing[0].id);
        continue;
      }
      await db.insert("model_assets", {
        id,
        code,
        role,
        property_id: null,
        typology,
        storage_path: `procedural://${role}/${typology}/v1`,
        format: "procedural",
        version: "1",
        publication: "published",
        validation: "validated",
        width_m: plan.widthM,
        depth_m: plan.depthM,
        height_m: role === "interior" ? plan.wallHeightM : typology === "T1" || typology === "T2" ? 3.9 : 6.4,
        origin_note: "Procedural prototype generated from the floor-plan specification",
        orientation: "Front (+Z) faces the access road. Y-up, metres.",
        scale_note: "1 unit = 1 metre",
        file_size_bytes: null,
        notes:
          "PROTOTYPE placeholder. Replace with a validated GLB via Admin → Media. Validation records schema and bounds checks only, not architectural accuracy.",
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      map[code] = id;
    }
  }
  const siteId = randomUUID();
  const existingSite = await db.select("model_assets", { where: { code: "HAVEN-SITE-MASTERPLAN" }, limit: 1 });
  if (existingSite[0]) map["HAVEN-SITE-MASTERPLAN"] = String(existingSite[0].id);
  else {
    await db.insert("model_assets", {
      id: siteId,
      code: "HAVEN-SITE-MASTERPLAN",
      role: "site",
      property_id: null,
      typology: null,
      storage_path: "procedural://site/masterplan/v1",
      format: "procedural",
      version: "1",
      publication: "published",
      validation: "validated",
      width_m: 96,
      depth_m: 90,
      height_m: 0.4,
      origin_note: "Procedural site prototype",
      orientation: "Y-up, metres, entrance to the south-east",
      scale_note: "1 unit = 1 metre",
      file_size_bytes: null,
      notes: "Prototype masterplan. Replace with a surveyed site model when available.",
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    map["HAVEN-SITE-MASTERPLAN"] = siteId;
  }
  return map;
}

export async function ensureSeeded(db: DataGateway): Promise<SeedReport> {
  const profileCount = await ensureProfiles(db);
  await ensureSettings(db);
  const assets = await ensureAssets(db);

  const propertyCount = await db.count("properties");
  if (propertyCount > 0) {
    return {
      seeded: false,
      properties: propertyCount,
      profiles: profileCount,
      leads: 0,
      visits: 0,
      media: 0,
      skippedBecausePopulated: true,
    };
  }

  let media = 0;
  const propertyIds = new Map<string, string>();

  const ordered = [...SEED_UNITS].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" }),
  );

  for (const unit of ordered) {
    const id = randomUUID();
    propertyIds.set(unit.code, id);
    const plan = getFloorPlan(unit.typology);
    await db.insert("properties", {
      id,
      code: unit.code,
      slug: slugFor(unit.code, unit.title),
      title: unit.title,
      typology: unit.typology,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      parking_spaces: unit.parkingSpaces,
      usable_area_m2: unit.usableAreaM2,
      outdoor_area_m2: unit.outdoorAreaM2,
      plot_area_m2: unit.plotAreaM2,
      price_cents: unit.priceCents,
      currency: unit.currency,
      status: unit.status,
      publication: unit.publication,
      description: unit.description,
      features: unit.features,
      exterior_model_ref: `asset:HAVEN-EXT-${unit.typology}`,
      interior_model_ref: `asset:HAVEN-INT-${unit.typology}`,
      floor_plan_ref: `asset:HAVEN-PLAN-${unit.typology}`,
      is_demo: 1,
      sort_order: TYPOLOGY_ORDER[unit.typology] * 100 + Number(unit.code.slice(1)),
      created_at: daysAgo(60 - Number(unit.code.slice(1))),
      updated_at: daysAgo(3),
      updated_by: null,
      archived_at: null,
    });

    await db.insert("property_positions", {
      property_id: id,
      x: unit.position.x,
      z: unit.position.z,
      rotation_y: unit.position.rotationY,
      published_x: unit.position.x,
      published_z: unit.position.z,
      published_rotation_y: unit.position.rotationY,
      draft_updated_at: null,
      published_at: daysAgo(12),
      updated_by: null,
    });

    const gallery = DEMO_GALLERY.slice(0, unit.typology === "T4" ? 5 : 4);
    let sort = 0;
    for (const image of gallery) {
      await db.insert("property_media", {
        id: randomUUID(),
        property_id: id,
        kind: image.kind,
        url: image.url,
        asset_id: null,
        caption: `${unit.title} — ${image.caption}`,
        alt_text: `${image.alt} (demonstration image for ${unit.title})`,
        width: 1600,
        height: 900,
        sort_order: sort++,
        created_at: nowIso(),
      });
      media += 1;
    }
    // The procedural floor plan is registered as a media entry pointing at the
    // plan asset, so the asset library is the single source of truth.
    await db.insert("property_media", {
      id: randomUUID(),
      property_id: id,
      kind: "plan",
      url: "/admin/3d-editor",
      asset_id: assets[`HAVEN-PLAN-${unit.typology}`] ?? null,
      caption: `${unit.typology} floor plan (prototype)`,
      alt_text: `Generated floor plan for ${unit.title}`,
      width: null,
      height: null,
      sort_order: 99,
      created_at: nowIso(),
    });
    media += 1;
    void plan;
  }

  // Reservations preserve history for reserved/sold units.
  for (const unit of ordered) {
    const id = propertyIds.get(unit.code)!;
    if (unit.status === "reserved" || unit.status === "sold") {
      await db.insert("reservations", {
        id: randomUUID(),
        property_id: id,
        lead_id: null,
        status: unit.status === "sold" ? "converted" : "active",
        reserved_until: unit.status === "reserved" ? daysAhead(21) : daysAgo(40),
        deposit_cents: unit.typology === "T4" ? 1_000_000 : 500_000,
        notes: "Demonstration reservation record.",
        created_at: daysAgo(unit.status === "sold" ? 70 : 10),
        updated_at: daysAgo(unit.status === "sold" ? 35 : 3),
        released_at: unit.status === "sold" ? daysAgo(35) : null,
        created_by: null,
      });
    }
  }

  let leads = 0;
  const leadIds = new Map<string, string>();
  for (const lead of SEED_LEADS) {
    const id = randomUUID();
    leadIds.set(lead.key, id);
    const propertyId = lead.propertyCode ? propertyIds.get(lead.propertyCode) ?? null : null;
    await db.insert("leads", {
      id,
      property_id: propertyId,
      typology: lead.typology,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      source: lead.source,
      consent: lead.consent ? 1 : 0,
      consent_at: lead.consent ? daysAgo(lead.daysAgo) : null,
      status: lead.status,
      assigned_to: null,
      notes: lead.notes,
      created_at: daysAgo(lead.daysAgo),
      updated_at: daysAgo(lead.daysAgo),
      retention_until: null,
    });
    leads += 1;
  }

  let visits = 0;
  for (const visit of SEED_VISITS) {
    const propertyId = propertyIds.get(visit.propertyCode)!;
    const preferred = new Date();
    preferred.setUTCDate(preferred.getUTCDate() + visit.daysFromNow);
    preferred.setUTCHours(visit.hour, 0, 0, 0);
    await db.insert("visit_requests", {
      id: randomUUID(),
      property_id: propertyId,
      lead_id: leadIds.get(visit.leadKey) ?? null,
      name: visit.name,
      email: visit.email,
      phone: visit.phone,
      preferred_at: preferred.toISOString(),
      duration_minutes: DEMO_SETTINGS.visitSlotMinutes,
      status: visit.status,
      notes: visit.notes,
      admin_notes: visit.status === "confirmed" ? "Confirmed by the sales team (demo)." : null,
      created_at: daysAgo(Math.abs(visit.daysFromNow) + 2),
      updated_at: daysAgo(1),
      confirmed_at: visit.status === "confirmed" ? daysAgo(1) : null,
      created_by: null,
    });
    visits += 1;
  }

  await db.insert("activity_logs", {
    id: randomUUID(),
    actor_id: null,
    actor_email: "system@haven.local",
    action: "inventory.seeded",
    entity_type: "system",
    entity_id: null,
    summary: "Seeded 13 demonstration properties (3 × T1, 3 × T2, 4 × T3, 3 × T4).",
    metadata: { demonstration: true },
    created_at: daysAgo(60),
  });
  await db.insert("activity_logs", {
    id: randomUUID(),
    actor_id: null,
    actor_email: "system@haven.local",
    action: "scene.published",
    entity_type: "scene",
    entity_id: null,
    summary: "Published the initial condominium masterplan (prototype geometry).",
    metadata: { prototype: true },
    created_at: daysAgo(12),
  });
  for (const unit of ordered.filter((u) => u.status === "reserved" || u.status === "sold")) {
    await db.insert("activity_logs", {
      id: randomUUID(),
      actor_id: null,
      actor_email: "system@haven.local",
      action: unit.status === "sold" ? "property.status_changed" : "property.reserved",
      entity_type: "property",
      entity_id: propertyIds.get(unit.code)!,
      summary: `${unit.code} · ${unit.title} → ${unit.status}`,
      metadata: { demo: true, to: unit.status as PropertyStatus },
      created_at: daysAgo(unit.status === "sold" ? 35 : 3),
    });
  }

  return {
    seeded: true,
    properties: ordered.length,
    profiles: profileCount,
    leads,
    visits,
    media,
    skippedBecausePopulated: false,
  };
}
