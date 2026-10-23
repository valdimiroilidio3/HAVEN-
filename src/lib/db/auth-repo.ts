import { randomUUID } from "node:crypto";
import type { DataGateway } from "./gateway";
import { mapProfile } from "./mappers";
import type { Profile, Role, SessionUser } from "@/lib/domain/types";

export interface ProfileWithPassword extends Profile {
  passwordHash: string | null;
}

const nowIso = () => new Date().toISOString();

export async function listProfiles(db: DataGateway): Promise<Profile[]> {
  const rows = await db.select("profiles", { orderBy: [{ column: "created_at", ascending: true }] });
  return rows.map((row) => {
    const { passwordHash: _hash, ...profile } = mapProfile(row);
    return profile;
  });
}

export async function findProfileByEmail(db: DataGateway, email: string): Promise<ProfileWithPassword | null> {
  const rows = await db.select("profiles", { where: { email: email.toLowerCase() }, limit: 1 });
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function findProfileById(db: DataGateway, id: string): Promise<ProfileWithPassword | null> {
  const rows = await db.select("profiles", { where: { id }, limit: 1 });
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function touchProfile(db: DataGateway, id: string): Promise<void> {
  await db.update("profiles", { id }, { last_seen_at: nowIso() });
}

export async function setProfileRole(db: DataGateway, id: string, role: Role): Promise<void> {
  const rows = await db.update("profiles", { id }, { role });
  if (!rows[0]) throw new Error("Profile not found");
}

export async function setProfileActive(db: DataGateway, id: string, active: boolean): Promise<void> {
  await db.update("profiles", { id }, { is_active: active ? 1 : 0 });
}

export async function upsertProfileFromSupabase(
  db: DataGateway,
  input: { id: string; email: string; fullName: string; role?: Role },
): Promise<ProfileWithPassword> {
  const existing = await findProfileById(db, input.id);
  if (existing) return existing;
  const row = await db.insert("profiles", {
    id: input.id,
    email: input.email.toLowerCase(),
    full_name: input.fullName,
    role: input.role ?? "viewer",
    is_active: 1,
    password_hash: null,
    created_at: nowIso(),
    last_seen_at: nowIso(),
  });
  return mapProfile(row);
}

/** Sessions are stored as SHA-256 hashes; the raw token only lives in the cookie. */
export async function createSessionRecord(
  db: DataGateway,
  input: { userId: string; tokenHash: string; expiresAt: string; userAgent?: string | null },
): Promise<void> {
  await db.insert("sessions", {
    id: randomUUID(),
    user_id: input.userId,
    token_hash: input.tokenHash,
    created_at: nowIso(),
    expires_at: input.expiresAt,
    user_agent: input.userAgent ?? null,
  });
}

export async function findSessionByTokenHash(
  db: DataGateway,
  tokenHash: string,
): Promise<{ user: SessionUser; expiresAt: string } | null> {
  const rows = await db.select("sessions", { where: { token_hash: tokenHash }, limit: 1 });
  const session = rows[0];
  if (!session) return null;
  if (new Date(String(session.expires_at)).getTime() < Date.now()) {
    await db.remove("sessions", { id: String(session.id) });
    return null;
  }
  const profile = await findProfileById(db, String(session.user_id));
  if (!profile || !profile.isActive) return null;
  return {
    user: { id: profile.id, email: profile.email, fullName: profile.fullName, role: profile.role },
    expiresAt: String(session.expires_at),
  };
}

export async function deleteSessionByTokenHash(db: DataGateway, tokenHash: string): Promise<void> {
  await db.remove("sessions", { token_hash: tokenHash });
}

export async function deleteUserSessions(db: DataGateway, userId: string): Promise<void> {
  await db.remove("sessions", { user_id: userId });
}

export async function deleteExpiredSessions(db: DataGateway): Promise<void> {
  const rows = await db.select("sessions", { where: { expires_at: { lt: nowIso() } } });
  for (const row of rows) await db.remove("sessions", { id: row.id });
}
