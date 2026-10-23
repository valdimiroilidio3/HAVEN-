/**
 * End-to-end smoke test of the data layer against a throwaway SQLite database.
 *
 *   npx tsx scripts/smoke.ts
 *
 * Exercises the same repository functions the server actions call, including
 * permission checks, status transitions, draft/publish separation and the
 * public enquiry pipeline.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteGateway } from "../src/lib/db/sqlite";
import { ensureSeeded } from "../src/lib/db/seed";
import { listProfiles } from "../src/lib/db/auth-repo";
import { SceneValidationError } from "../src/lib/domain/errors";
import {
  archiveProperty,
  changePropertyStatus,
  createLead,
  createProperty,
  createPublicVisit,
  getDashboardMetrics,
  getProperty,
  getSceneAdmin,
  listProperties,
  listPublicProperties,
  publishScene,
  resetPlacementDraft,
  savePlacementDraft,
  setPublication,
  updateLead,
  updateProperty,
  updateVisit,
} from "../src/lib/db/repositories";

const failures: string[] = [];
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "haven-smoke-"));
  const db = new SqliteGateway(path.join(dir, "smoke.db"));
  try {
    await ensureSeeded(db);
    const profiles = await listProfiles(db);
    const admin = profiles.find((p) => p.role === "admin");
    const manager = profiles.find((p) => p.role === "manager");
    const viewer = profiles.find((p) => p.role === "viewer");
    if (!admin || !manager || !viewer) throw new Error("Seed did not create all three demo roles.");

    const adminActor = { id: admin.id, email: admin.email, role: admin.role };
    const managerActor = { id: manager.id, email: manager.email, role: manager.role };
    const viewerActor = { id: viewer.id, email: viewer.email, role: viewer.role };

    console.log("\nProperties");
    const created = await createProperty(db, managerActor, {
      code: "H14",
      title: "Test House",
      typology: "T2",
      bedrooms: 2,
      bathrooms: 2,
      parkingSpaces: 1,
      usableAreaM2: 120,
      outdoorAreaM2: 30,
      plotAreaM2: 200,
      priceEuros: 450000,
      currency: "EUR",
      publication: "draft",
      description: "Smoke test home.",
      features: ["Garden"],
      exteriorModelRef: "procedural:exterior:T2@1",
      interiorModelRef: "procedural:interior:T2@1",
      floorPlanRef: "procedural:plan:T2@1",
    });
    check("manager can create a draft property", created.publication === "draft");
    check("new property gets a placement row", Boolean((await getSceneAdmin(db)).positions.find((p) => p.propertyId === created.id)));

    let denied = false;
    try {
      await createProperty(db, viewerActor, {
        code: "H15",
        title: "Should Fail",
        typology: "T1",
        bedrooms: 1,
        bathrooms: 1,
        parkingSpaces: 0,
        usableAreaM2: 60,
        outdoorAreaM2: 0,
        plotAreaM2: null,
        priceEuros: 200000,
        currency: "EUR",
        publication: "draft",
        features: [],
      });
    } catch {
      denied = true;
    }
    check("viewer cannot create properties", denied);

    const updated = await updateProperty(db, managerActor, created.id, {
      code: "H14",
      title: "Test House (revised)",
      typology: "T2",
      bedrooms: 2,
      bathrooms: 2,
      parkingSpaces: 2,
      usableAreaM2: 121,
      outdoorAreaM2: 31,
      plotAreaM2: 200,
      priceEuros: 460000,
      currency: "EUR",
      publication: "draft",
      features: ["Garden", "Solar"],
    });
    check("update persists changes", updated.title.includes("revised") && updated.priceCents === 46_000_000);

    const reserved = await changePropertyStatus(db, managerActor, {
      propertyId: created.id,
      status: "reserved",
      reservedUntil: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
    const relations = await (await import("../src/lib/db/repositories")).getPropertyRelations(db, created.id);
    check("reserving records an active reservation", reserved.status === "reserved" && Boolean(relations?.reservations.some((r) => r.status === "active")));

    const available = await changePropertyStatus(db, managerActor, { propertyId: created.id, status: "available" });
    const afterRelease = await (await import("../src/lib/db/repositories")).getPropertyRelations(db, created.id);
    check("releasing closes the reservation", available.status === "available" && Boolean(afterRelease?.reservations.every((r) => r.status !== "active")));

    // Joining the public scene is itself a publication: the placement is
    // validated first. This home was created at a default slot with no road
    // frontage, so the gate must refuse it — and leave it in draft.
    let refused: unknown;
    try {
      await setPublication(db, managerActor, created.id, "published");
    } catch (error) {
      refused = error;
    }
    check("a home with no legal placement cannot go public", refused instanceof SceneValidationError);
    check(
      "the refused home stays a draft",
      (await getProperty(db, created.id))?.publication === "draft",
    );

    const archived = await archiveProperty(db, adminActor, created.id);
    check("admin can archive", archived.publication === "archived");
    let archivedDenied = false;
    try {
      await archiveProperty(db, managerActor, created.id);
    } catch {
      archivedDenied = true;
    }
    check("manager cannot archive", archivedDenied);

    console.log("\nScene draft/publish");
    const before = await getSceneAdmin(db);
    const target = before.positions[0]!;
    await savePlacementDraft(db, managerActor, [{ propertyId: target.propertyId, x: target.x + 2, z: target.z, rotationY: target.rotationY }]);
    const afterDraft = await getSceneAdmin(db);
    check("draft move does not touch published coordinates", afterDraft.isDirty && afterDraft.positions[0]!.x !== afterDraft.positions[0]!.publishedX);

    let publishDenied = false;
    try {
      await publishScene(db, managerActor);
    } catch {
      publishDenied = true;
    }
    check("manager cannot publish the scene", publishDenied);

    const publishResult = await publishScene(db, adminActor);
    const afterPublish = await getSceneAdmin(db);
    const publishedIds = new Set(
      (await listProperties(db, { includeArchived: true, pageSize: 100 })).rows
        .filter((property) => property.publication === "published")
        .map((property) => property.id),
    );
    check(
      "publishing promotes every published placement",
      publishResult.published === publishedIds.size &&
        afterPublish.positions.filter((p) => publishedIds.has(p.propertyId)).every((p) => p.x === p.publishedX && p.z === p.publishedZ),
    );
    check("homes still in draft are withheld, not published", publishResult.withheld === afterPublish.positions.length - publishedIds.size);

    await savePlacementDraft(db, managerActor, [{ propertyId: target.propertyId, x: target.x + 4, z: target.z, rotationY: target.rotationY }]);
    await resetPlacementDraft(db, managerActor);
    const afterReset = await getSceneAdmin(db);
    check("reset restores published coordinates", afterReset.positions.every((p) => p.x === p.publishedX) && !afterReset.isDirty);

    console.log("\nEnquiries and viewings");
    const publicProperty = (await listPublicProperties(db)).find((p) => p.publication === "published" && p.status !== "hidden");
    if (!publicProperty) throw new Error("No published property available for enquiry smoke tests.");
    const lead = await createLead(db, {
      name: "Ana Silva",
      email: "ana@example.com",
      phone: "+351 910 000 000",
      message: "Interested in a two-bedroom home.",
      typology: "T2",
      propertyId: publicProperty.id,
      consent: true,
      source: "website",
    });
    check("enquiry is stored with consent timestamp", Boolean(lead.consent && lead.consentAt && lead.retentionUntil));

    let consentDenied = false;
    try {
      await createLead(db, { name: "No Consent", email: "no@example.com", propertyId: undefined, typology: "T1", consent: false, message: "hello", source: "website" });
    } catch {
      consentDenied = true;
    }
    check("enquiry without consent is rejected", consentDenied);

    const updatedLead = await updateLead(db, managerActor, lead.id, { status: "contacted", notes: "Called, viewing offered." });
    check("lead status and notes persist", Boolean(updatedLead.status === "contacted" && updatedLead.notes?.includes("Called")));

    const visitDate = new Date(Date.now() + 3 * 864e5);
    const visit = await createPublicVisit(db, {
      name: "Ana Silva",
      email: "ana@example.com",
      phone: "+351 910 000 000",
      propertyId: publicProperty.id,
      preferredDate: visitDate.toISOString().slice(0, 10),
      preferredTime: "15:00",
      notes: "Afternoon preferred.",
      consent: true,
    });
    check("viewing request is stored as requested", visit.status === "requested");

    const confirmed = await updateVisit(db, managerActor, visit.id, {
      status: "confirmed",
      adminNotes: "Confirmed by phone.",
      preferredAt: visit.preferredAt,
    });
    check("viewing confirmation sets confirmed timestamp", confirmed.status === "confirmed" && Boolean(confirmed.confirmedAt));

    let pastVisitDenied = false;
    try {
      await createPublicVisit(db, {
        name: "Past",
        email: "past@example.com",
        
        propertyId: publicProperty.id,
        preferredDate: new Date(Date.now() - 864e5).toISOString().slice(0, 10),
        preferredTime: "10:00",
        consent: true,
      });
    } catch {
      pastVisitDenied = true;
    }
    check("past viewing requests are rejected", pastVisitDenied);

    console.log("\nMetrics");
    const metrics = await getDashboardMetrics(db);
    check("metrics exclude archived homes", metrics.totalProperties === 13 && metrics.available >= 1);

    const property = await getProperty(db, created.id);
    check("archived property remains readable for audit", property?.publication === "archived");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(` - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\nAll smoke checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
