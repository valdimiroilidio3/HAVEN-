import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteGateway } from "@/lib/db/sqlite";
import { ensureSeeded } from "@/lib/db/seed";
import { listProfiles } from "@/lib/db/auth-repo";
import {
  getPublishedScene,
  getSceneAdmin,
  listActivity,
  publishScene,
  savePlacementDraft,
  type Actor,
} from "@/lib/db/repositories";
import { ConflictError, SceneValidationError, UnauthorizedError } from "@/lib/domain/errors";
import { setPublication } from "@/lib/db/repositories";
import { evaluatePublication, draftFingerprint } from "@/lib/domain/scene-publication";
import { validateScene } from "@/lib/3d/validate";
import { SEED_UNITS } from "@/lib/domain/inventory";
import { footpaths } from "@/lib/3d/circulation";
import { plotFootprint, plotRearDepth } from "@/lib/3d/site";

/**
 * Publication gate — integration.
 *
 * A throwaway SQLite database and the *real* validator: no mocked "valid" scene,
 * no stubbed findings. What is asserted here is what the server action does.
 */

let dir: string;
let db: SqliteGateway;
let admin: Actor;
let manager: Actor;
let viewer: Actor;

/**
 * The seed leaves H05 and H13 in draft, so the public scene has 11 homes. The
 * approved masterplan has 13; these two are flipped directly in the fixture so
 * the tests exercise the full plan (and its known H13 warning).
 */
const publishEveryone = async () => {
  for (const code of ["H05", "H13"]) {
    const rows = await db.select("properties", { where: { code } });
    await db.update("properties", { id: String(rows[0]!.id) }, { publication: "published" });
  }
};

/** Published coordinates, in a stable order: the ground truth "did anything ship?" */
const publishedSnapshot = async () =>
  (await getSceneAdmin(db)).positions
    .map((position) => `${position.propertyId}:${position.publishedX},${position.publishedZ},${position.publishedRotationY}`)
    .sort();

const sceneEntries = () =>
  SEED_UNITS.map((unit) => ({
    code: unit.code,
    position: { x: unit.position.x, z: unit.position.z },
    rotationY: unit.position.rotationY,
    typology: unit.typology,
  }));

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "haven-publish-"));
  db = new SqliteGateway(path.join(dir, "scene.db"));
  await ensureSeeded(db);
  const profiles = await listProfiles(db);
  const pick = (role: string) => {
    const profile = profiles.find((candidate) => candidate.role === role)!;
    return { id: profile.id, email: profile.email, role: profile.role };
  };
  admin = pick("admin");
  manager = pick("manager");
  viewer = pick("viewer");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("publishing a valid scene", () => {
  it("publishes the validated draft and records the warnings it carries", async () => {
    await publishEveryone();
    const before = await getSceneAdmin(db);
    const result = await publishScene(db, admin, { expectedFingerprint: before.draftFingerprint });

    expect(result.published).toBe(before.positions.length);
    expect(result.fingerprint).toBe(before.draftFingerprint);
    // The shipped scene has exactly one known medium (H13's footway corridor).
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("H13");

    const after = await getSceneAdmin(db);
    expect(after.isDirty).toBe(false);
    expect(after.positions.every((position) => position.x === position.publishedX)).toBe(true);
    expect(after.lastPublishedAt).not.toBeNull();
  });

  it("records the warnings in the audit log instead of dropping them", async () => {
    await publishEveryone();
    await publishScene(db, admin);
    const entries = await listActivity(db, { limit: 5 });
    const published = entries.find((entry) => entry.action === "scene.published");
    expect(published).toBeDefined();
    const metadata = published!.metadata as { warnings?: unknown[]; fingerprint?: string };
    expect(Array.isArray(metadata.warnings)).toBe(true);
    expect(metadata.warnings).toHaveLength(1);
    expect(metadata.fingerprint).toMatch(/^[0-9a-f]{8}:\d+$/);
  });

  it("is idempotent: publishing twice does not duplicate rows or drift", async () => {
    await publishEveryone();
    const first = await publishScene(db, admin);
    const second = await publishScene(db, admin);
    const after = await getSceneAdmin(db);

    expect(second.published).toBe(first.published);
    expect(after.positions).toHaveLength(first.published);
    expect(after.isDirty).toBe(false);
    expect(after.positions.every((position) => position.x === position.publishedX)).toBe(true);
    expect(second.fingerprint).toBe(first.fingerprint);
  });
});

describe("publishing a scene with blocking defects", () => {
  it("refuses a house dropped on the ring road and leaves published coordinates untouched", async () => {
    const target = (await getSceneAdmin(db)).positions[0]!;
    const publishedBefore = (await getSceneAdmin(db)).positions.map((position) => ({
      id: position.propertyId,
      x: position.publishedX,
      z: position.publishedZ,
      rot: position.publishedRotationY,
    }));

    // Put H01 on the northern carriageway of the ring.
    await savePlacementDraft(db, manager, [{ propertyId: target.propertyId, x: -24.9, z: -6, rotationY: 0 }]);

    const draft = await getSceneAdmin(db);
    expect(draft.isDirty).toBe(true);

    let error: unknown;
    try {
      await publishScene(db, admin, { expectedFingerprint: draft.draftFingerprint });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SceneValidationError);
    const issues = (error as SceneValidationError).issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.severity === "critical")).toBe(true);
    expect(issues.every((issue) => issue.suggestion.length > 0)).toBe(true);

    const after = await getSceneAdmin(db);
    // Nothing was published, and the draft that failed is still the draft.
    expect(
      after.positions.map((position) => ({
        id: position.propertyId,
        x: position.publishedX,
        z: position.publishedZ,
        rot: position.publishedRotationY,
      })),
    ).toEqual(publishedBefore);
    expect(after.isDirty).toBe(true);
  });

  it("keeps draftDirty consistent after a failed publication", async () => {
    const before = await getSceneAdmin(db);
    const target = before.positions[0]!;
    const shipped = await publishedSnapshot();

    // A saved draft that lands in the central garden: accepted by the draft
    // editor (no overlap with a neighbour) but spatially invalid.
    await savePlacementDraft(db, manager, [{ propertyId: target.propertyId, x: -24.9, z: -6, rotationY: 0 }]);
    await expect(publishScene(db, admin)).rejects.toBeInstanceOf(SceneValidationError);

    const after = await getSceneAdmin(db);
    expect(after.isDirty).toBe(true);
    expect(after.positions.find((position) => position.propertyId === target.propertyId)?.z).toBe(-6);
    expect(after.positions.find((position) => position.propertyId === target.propertyId)?.x).toBe(-24.9);
    expect(await publishedSnapshot()).toEqual(shipped);
    expect(after.lastPublishedAt).toBe(before.lastPublishedAt);
  });
});

describe("concurrency", () => {
  it("refuses to publish a draft that changed after the page was loaded", async () => {
    const loaded = await getSceneAdmin(db);
    const target = loaded.positions[0]!;

    // Another editor saves while this operator is still looking at the page.
    await savePlacementDraft(db, manager, [
      { propertyId: target.propertyId, x: target.x + 0.5, z: target.z, rotationY: target.rotationY },
    ]);

    await expect(
      publishScene(db, admin, { expectedFingerprint: loaded.draftFingerprint }),
    ).rejects.toBeInstanceOf(ConflictError);

    const after = await getSceneAdmin(db);
    expect(after.positions.find((position) => position.propertyId === target.propertyId)?.publishedX).toBe(target.publishedX);

    // Reloading the editor gives a fresh fingerprint, and then it publishes.
    const reloaded = await getSceneAdmin(db);
    expect(reloaded.draftFingerprint).not.toBe(loaded.draftFingerprint);
    const result = await publishScene(db, admin, { expectedFingerprint: reloaded.draftFingerprint });
    expect(result.fingerprint).toBe(reloaded.draftFingerprint);
  });

  it("detects a change made during the copy itself, via compare-and-set", async () => {
    const draft = await getSceneAdmin(db);
    const target = draft.positions[0]!;

    // A gateway that mutates the draft on the first write, simulating another
    // client committing between the read and the update.
    let tampered = false;
    const racing = {
      transaction: <T>(fn: (tx: SqliteGateway) => Promise<T>) =>
        db.transaction(async (tx) => {
          const proxy = new Proxy(tx, {
            get(object, property, receiver) {
              if (property !== "update") return Reflect.get(object, property, receiver);
              return async (table: string, where: Record<string, unknown>, patch: Record<string, unknown>) => {
                if (!tampered && table === "property_positions") {
                  tampered = true;
                  await db.update(
                    "property_positions",
                    { property_id: target.propertyId },
                    { x: target.x + 1, z: target.z, rotation_y: target.rotationY },
                  );
                }
                return (object.update as (t: string, w: Record<string, unknown>, p: Record<string, unknown>) => Promise<unknown>)(
                  table,
                  where,
                  patch,
                );
              };
            },
          }) as SqliteGateway;
          return fn(proxy);
        }),
    } as unknown as SqliteGateway;

    const shipped = await publishedSnapshot();
    const logBefore = (await listActivity(db, { limit: 50 })).filter((entry) => entry.action === "scene.published").length;
    await expect(publishScene(racing, admin)).rejects.toBeInstanceOf(ConflictError);

    const after = await getSceneAdmin(db);
    expect(await publishedSnapshot()).toEqual(shipped);
    // Nothing was logged as published, and the tamper was rolled back with the
    // transaction, so the draft still matches what shipped.
    const logAfter = (await listActivity(db, { limit: 50 })).filter((entry) => entry.action === "scene.published").length;
    expect(logAfter).toBe(logBefore);
    expect(after.isDirty).toBe(false);
  });
});

describe("a home joining the public scene", () => {
  it("is validated first: an invalid draft placement cannot go public", async () => {
    // H05 is a draft home in the seed (H13 is also hidden, so its publication is
    // refused earlier by the state machine — a different, older guard).
    const h05 = await db.select("properties", { where: { code: "H05" } });
    const h05Id = String(h05[0]!.id);
    await savePlacementDraft(db, manager, [{ propertyId: h05Id, x: -24.9, z: -6, rotationY: 0 }]);

    let error: unknown;
    try {
      await setPublication(db, admin, h05Id, "published");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SceneValidationError);
    expect((error as SceneValidationError).issues.some((issue) => issue.severity === "critical")).toBe(true);

    const after = await db.select("properties", { where: { id: h05Id } });
    expect(String(after[0]!.publication)).toBe("draft");
    const scene = await getPublishedScene(db);
    expect(scene.some((entry) => entry.property.code === "H05")).toBe(false);
  });

  it("is promoted with the placement that was validated", async () => {
    const h05 = await db.select("properties", { where: { code: "H05" } });
    const h05Id = String(h05[0]!.id);
    const before = (await getSceneAdmin(db)).positions.find((position) => position.propertyId === h05Id)!;

    await setPublication(db, admin, h05Id, "published");

    const after = (await getSceneAdmin(db)).positions.find((position) => position.propertyId === h05Id)!;
    expect(after.publishedX).toBe(before.x);
    expect(after.publishedZ).toBe(before.z);
    expect(after.publishedAt).not.toBeNull();

    const scene = await getPublishedScene(db);
    expect(scene.some((entry) => entry.property.code === "H05")).toBe(true);
    // The scene is drawn at the published coordinates the gate approved.
    const entry = scene.find((candidate) => candidate.property.code === "H05")!;
    expect(entry.position.publishedX).toBe(before.x);
  });
});

describe("authorisation", () => {
  it("still refuses a manager and a viewer", async () => {
    const before = await getSceneAdmin(db);
    const shipped = await publishedSnapshot();

    await expect(publishScene(db, manager)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(publishScene(db, viewer)).rejects.toBeInstanceOf(UnauthorizedError);

    const after = await getSceneAdmin(db);
    expect(after.lastPublishedAt).toBe(before.lastPublishedAt);
    expect(await publishedSnapshot()).toEqual(shipped);
  });
});

describe("the H13 conflict is preserved, not patched away", () => {
  it("is still detected from the original geometry", () => {
    const report = validateScene({
      entries: SEED_UNITS.map((unit) => ({
        property: { code: unit.code, typology: unit.typology },
        position: { x: unit.position.x, z: unit.position.z },
        rotationY: unit.position.rotationY,
      })),
    });

    const h13 = report.findings.filter((finding) => finding.subject === "H13");
    expect(h13).toHaveLength(1);
    expect(h13[0]!.severity).toBe("medium");
    expect(h13[0]!.objectId).toBe("path/ring-outer:walk:2");
    expect(h13[0]!.message).toContain("5 sampled point(s)");
    expect(h13[0]!.message).toContain("(-41.9, 32.0)");

    // The reason is geometric, and it is measurable: 1.85 m of corridor, 2.2 m
    // of path. Neither number was changed to make the gate green.
    const unit = SEED_UNITS.find((candidate) => candidate.code === "H13")!;
    const plot = plotFootprint(
      unit.position,
      unit.position.rotationY,
      unit.typology,
      plotRearDepth(unit.position, unit.position.rotationY, unit.typology),
    );
    const kerb = 40; // SITE.ring.outer.maxX, the west carriageway edge
    const corridor = Math.abs(Math.abs(plot.maxX) - kerb);
    // The loop is split where it crosses tarmac; read every ring-outer stretch.
    const pieces = footpaths(sceneEntries()).filter((candidate) => candidate.id.startsWith("path/ring-outer"));
    const path = pieces[0]!;
    const points = pieces.flatMap((piece) => piece.points);
    const clipping = points.filter((point) => point.x < plot.maxX && point.z > plot.minZ && point.z < plot.maxZ);

    expect(corridor).toBeCloseTo(1.85, 2);
    expect(path.width).toBe(2.2);
    expect(clipping).toHaveLength(5);
    expect(clipping.every((point) => point.x < plot.maxX)).toBe(true);
  });

  it("lets a medium finding publish: warnings are not silently promoted to errors", async () => {
    await publishEveryone();
    const report = validateScene({
      entries: SEED_UNITS.map((unit) => ({
        property: { code: unit.code, typology: unit.typology },
        position: { x: unit.position.x, z: unit.position.z },
        rotationY: unit.position.rotationY,
      })),
    });
    const evaluation = evaluatePublication(report);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.blocking).toEqual([]);
    expect(evaluation.warnings.map((warning) => warning.subject)).toEqual(["H13"]);

    const result = await publishScene(db, admin);
    expect(result.published).toBe(13);
  });
});

describe("draftFingerprint", () => {
  it("is stable, order independent and sensitive to a millimetre", () => {
    const a = [
      { propertyId: "b", x: 1, z: 2, rotationY: 0 },
      { propertyId: "a", x: 3, z: 4, rotationY: 90 },
    ];
    const shuffled = [a[1]!, a[0]!];
    expect(draftFingerprint(a)).toBe(draftFingerprint(shuffled));
    expect(draftFingerprint(a)).not.toBe(draftFingerprint([{ propertyId: "a", x: 3, z: 4.001, rotationY: 90 }, a[0]!]));
    expect(draftFingerprint(a)).toMatch(/^[0-9a-f]{8}:2$/);
  });
});
