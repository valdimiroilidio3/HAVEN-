import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Fail-safe: if the validator itself breaks, publishing must refuse.
 *
 * `validateScene` is wrapped, not replaced with a stub that returns success — the
 * real implementation still runs for every other test in this file. Only one
 * call is forced to throw, and the assertion is that nothing reaches the
 * published columns.
 */
vi.mock("@/lib/3d/validate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/3d/validate")>();
  return { ...actual, validateScene: vi.fn(actual.validateScene) };
});

const { SqliteGateway } = await import("@/lib/db/sqlite");
const { ensureSeeded } = await import("@/lib/db/seed");
const { listProfiles } = await import("@/lib/db/auth-repo");
const repositories = await import("@/lib/db/repositories");
const { validateScene } = await import("@/lib/3d/validate");
const { DomainError } = await import("@/lib/domain/errors");

const { getSceneAdmin, listActivity, publishScene } = repositories;
type Actor = typeof repositories extends never ? never : Awaited<ReturnType<typeof listProfiles>>[number];

let dir: string;
let db: InstanceType<typeof SqliteGateway>;
let admin: { id: string | null; email: string | null; role: "admin" | "manager" | "viewer" };

const publishedSnapshot = async () =>
  (await getSceneAdmin(db)).positions
    .map((position) => `${position.propertyId}:${position.publishedX},${position.publishedZ},${position.publishedRotationY}`)
    .sort();

beforeEach(async () => {
  vi.mocked(validateScene).mockClear();
  dir = mkdtempSync(path.join(tmpdir(), "haven-publish-fail-"));
  db = new SqliteGateway(path.join(dir, "scene.db"));
  await ensureSeeded(db);
  const profiles = await listProfiles(db);
  const profile = profiles.find((candidate) => candidate.role === "admin")!;
  admin = { id: profile.id, email: profile.email, role: "admin" };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("validator failure", () => {
  it("refuses the publication instead of shipping an unvalidated scene", async () => {
    const shipped = await publishedSnapshot();
    const logBefore = (await listActivity(db, { limit: 50 })).filter((entry) => entry.action === "scene.published").length;

    vi.mocked(validateScene).mockImplementationOnce(() => {
      throw new Error("validator exploded");
    });

    let error: unknown;
    try {
      await publishScene(db, admin as Actor as never);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DomainError);
    expect((error as InstanceType<typeof DomainError>).code).toBe("scene_validation_failed");
    // A safe refusal: no partial publication, no audit entry, no state drift.
    expect(await publishedSnapshot()).toEqual(shipped);
    const logAfter = (await listActivity(db, { limit: 50 })).filter((entry) => entry.action === "scene.published").length;
    expect(logAfter).toBe(logBefore);
    expect((await getSceneAdmin(db)).isDirty).toBe(false);
  });

  it("publishes normally once the validator recovers", async () => {
    const result = await publishScene(db, admin as Actor as never);
    // The seeded public scene: 11 homes published, 2 still in draft.
    expect(result.published).toBe(11);
    expect(result.withheld).toBe(2);
    expect(vi.mocked(validateScene)).toHaveBeenCalled();
  });
});
