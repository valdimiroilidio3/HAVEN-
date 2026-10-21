"use server";

import { getDb } from "@/lib/db";
import { createLead, createPublicVisit } from "@/lib/db/repositories";
import { publicLeadSchema, publicVisitSchema, zodFieldErrors } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientKey, failure, formToObject, zodFailure } from "./helpers";

export type PublicFormState = ActionResult<{ id: string }> | null;

export async function submitEnquiry(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  const key = await clientKey("lead");
  const limit = rateLimit(key, 6, 10 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: "Too many enquiries from this connection. Please try again later." };
  }

  const parsed = publicLeadSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", fieldErrors: errors };
  }
  if (parsed.data.company && parsed.data.company.length > 0) {
    return { ok: false, error: "Spam detected." };
  }

  try {
    const db = await getDb();
    const lead = await createLead(db, {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      message: parsed.data.message,
      propertyId: parsed.data.propertyId,
      typology: parsed.data.typology,
      source: parsed.data.source,
      consent: parsed.data.consent,
    });
    return { ok: true, data: { id: lead.id } };
  } catch (error) {
    return failure(error);
  }
}

export async function submitVisitRequest(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  const key = await clientKey("visit");
  const limit = rateLimit(key, 4, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: "Too many viewing requests from this connection. Please try again later." };
  }

  const parsed = publicVisitSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  try {
    const db = await getDb();
    const visit = await createPublicVisit(db, {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      propertyId: parsed.data.propertyId,
      preferredDate: parsed.data.preferredDate,
      preferredTime: parsed.data.preferredTime,
      notes: parsed.data.notes,
      consent: parsed.data.consent,
    });
    return { ok: true, data: { id: visit.id } };
  } catch (error) {
    return failure(error);
  }
}

export { zodFailure };
