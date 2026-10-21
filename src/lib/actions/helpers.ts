import { headers } from "next/headers";
import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { zodFieldErrors } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";

/** Best-effort client identifier for rate limiting (per-instance). */
export async function clientKey(scope: string): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

export function formToObject(formData: FormData): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    object[key] = values.length > 1 ? values.map(String) : values[0] instanceof File ? values[0] : String(values[0] ?? "");
  }
  return object;
}

export function featuresFromForm(formData: FormData): string[] {
  return formData
    .getAll("features")
    .flatMap((value) => String(value).split("\n"))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function zodFailure(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: zodFieldErrors(error) };
}

export function failure(error: unknown): ActionResult<never> {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message };
  }
  console.error("[HAVEN] action failed:", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}
