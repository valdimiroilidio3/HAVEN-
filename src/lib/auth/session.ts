import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { createSessionRecord, deleteSessionByTokenHash, findSessionByTokenHash, touchProfile } from "@/lib/db/auth-repo";
import type { AuthSession, Role, SessionUser } from "@/lib/domain/types";
import { can, type Capability } from "@/lib/domain/constants";
import { UnauthorizedError } from "@/lib/domain/errors";
import type { Actor } from "@/lib/db/repositories";

export const SESSION_COOKIE = "haven_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Read and validate the session cookie. Cached per request. */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  return findSessionByTokenHash(db, hashToken(token));
});

export async function requireUser(nextPath = "/admin"): Promise<AuthSession> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}

export async function requireCapability(capability: Capability, nextPath = "/admin"): Promise<AuthSession> {
  const session = await requireUser(nextPath);
  if (!can(session.user.role, capability)) redirect("/admin?denied=1");
  return session;
}

export async function requireApiUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError("Sign in to continue.");
  return session;
}

export async function requireApiCapability(capability: Capability): Promise<AuthSession> {
  const session = await requireApiUser();
  if (!can(session.user.role, capability)) throw new UnauthorizedError();
  return session;
}

export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, role: session.user.role };
}

export async function requireActor(capability?: Capability): Promise<Actor> {
  const session = await requireUser();
  if (capability && !can(session.user.role, capability)) {
    throw new UnauthorizedError(`Your role (${session.user.role}) cannot perform this action.`);
  }
  return { id: session.user.id, email: session.user.email, role: session.user.role };
}

export async function establishSession(user: SessionUser, userAgent?: string | null): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await createSessionRecord(db, { userId: user.id, tokenHash: hashToken(token), expiresAt, userAgent });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
  await touchProfile(db, user.id);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await deleteSessionByTokenHash(db, hashToken(token));
  }
  store.delete(SESSION_COOKIE);
}

export function canDo(role: Role, capability: Capability): boolean {
  return can(role, capability);
}
