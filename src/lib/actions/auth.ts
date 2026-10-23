"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/db";
import { findProfileByEmail, findProfileById, upsertProfileFromSupabase } from "@/lib/db/auth-repo";
import { establishSession, destroySession, getSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema, zodFieldErrors } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";
import { rateLimit } from "@/lib/auth/rate-limit";
import { hasSupabaseConfig } from "@/lib/db/supabase";

export type LoginState = ActionResult<undefined> | null;

function safeNext(next: string | undefined): string {
  if (!next) return "/admin";
  if (!next.startsWith("/") || next.startsWith("//")) return "/admin";
  return next;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? "/admin"),
  };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check your credentials.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const headerList = await headers();
  const ip = (headerList.get("x-forwarded-for") ?? "local").split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`login:${ip}:${parsed.data.email}`, 6, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: "Too many sign-in attempts. Please wait a few minutes and try again." };
  }

  const db = await getDb();

  try {
    if (db.driver === "supabase" && hasSupabaseConfig()) {
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await anon.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (error || !data.user) {
        return { ok: false, error: "Email or password is incorrect." };
      }
      const profile =
        (await findProfileById(db, data.user.id)) ??
        (await findProfileByEmail(db, parsed.data.email)) ??
        (await upsertProfileFromSupabase(db, {
          id: data.user.id,
          email: data.user.email ?? parsed.data.email,
          fullName: String(data.user.user_metadata?.full_name ?? parsed.data.email),
          role: "viewer",
        }));
      if (!profile.isActive) return { ok: false, error: "This account has been deactivated." };
      await establishSession(
        { id: profile.id, email: profile.email, fullName: profile.fullName, role: profile.role },
        headerList.get("user-agent"),
      );
      redirect(safeNext(parsed.data.next));
    }

    const profile = await findProfileByEmail(db, parsed.data.email);
    // Constant-ish response regardless of which factor failed.
    const valid = profile ? verifyPassword(parsed.data.password, profile.passwordHash) : false;
    if (!profile || !valid) {
      return { ok: false, error: "Email or password is incorrect." };
    }
    if (!profile.isActive) return { ok: false, error: "This account has been deactivated." };
    await establishSession(
      { id: profile.id, email: profile.email, fullName: profile.fullName, role: profile.role },
      headerList.get("user-agent"),
    );
  } catch (error) {
    // Next.js redirects are thrown; re-throw them.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("[HAVEN] sign-in error:", error);
    return { ok: false, error: "Sign-in is temporarily unavailable. Please try again." };
  }

  redirect(safeNext(parsed.data.next));
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function currentRole(): Promise<string | null> {
  const session = await getSession();
  return session?.user.role ?? null;
}
