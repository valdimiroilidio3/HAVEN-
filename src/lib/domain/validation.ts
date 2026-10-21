import { z } from "zod";
import {
  ASSET_FORMATS,
  ASSET_PUBLICATION_STATES,
  ASSET_ROLES,
  ASSET_VALIDATION_STATES,
  CURRENCIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MEDIA_KINDS,
  PROPERTY_STATUSES,
  PUBLICATION_STATUSES,
  ROLES,
  TYPOLOGIES,
  VISIT_STATUSES,
} from "./types";

export const typologyBedrooms: Record<(typeof TYPOLOGIES)[number], number> = { T1: 1, T2: 2, T3: 3, T4: 4 };

/* ── Auth ─────────────────────────────────────────────────────────────── */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Password must contain at least 8 characters.").max(200),
  next: z.string().max(500).optional(),
});

/* ── Properties ───────────────────────────────────────────────────────── */

const area = (label: string, max: number) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(max, `${label} seems implausible.`);

export const propertyInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{1,3}\d{2,3}$/, "Use a code such as H01 or HV-101."),
    title: z.string().trim().min(2, "Title is required.").max(80, "Title is too long."),
    typology: z.enum(TYPOLOGIES, { errorMap: () => ({ message: "Choose a supported typology (T1–T4)." }) }),
    bedrooms: z.coerce.number().int().min(0).max(10),
    bathrooms: z.coerce.number().int().min(1).max(10),
    parkingSpaces: z.coerce.number().int().min(0).max(10),
    usableAreaM2: area("Usable area", 2000).min(1, "Usable area must be greater than zero."),
    outdoorAreaM2: area("Outdoor area", 10000),
    plotAreaM2: z
      .union([z.literal(""), z.coerce.number().min(0).max(100000)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : Number(v))),
    priceEuros: z
      .union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : Math.round(Number(v)))),
    currency: z.enum(CURRENCIES),
    publication: z.enum(["draft", "published"]),
    description: z.string().trim().max(2000, "Description is too long.").optional(),
    features: z
      .array(z.string().trim().min(1).max(80))
      .max(24, "Keep the feature list to 24 items.")
      .optional()
      .default([]),
    exteriorModelRef: z.string().trim().max(500).optional(),
    interiorModelRef: z.string().trim().max(500).optional(),
    floorPlanRef: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const expected = typologyBedrooms[value.typology];
    if (value.bedrooms !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bedrooms"],
        message: `A ${value.typology} must have exactly ${expected} bedroom${expected > 1 ? "s" : ""}.`,
      });
    }
    if (value.plotAreaM2 !== null && value.plotAreaM2 < value.usableAreaM2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plotAreaM2"],
        message: "Plot area cannot be smaller than the usable area.",
      });
    }
    if (value.priceEuros !== null && value.priceEuros > 0 && value.priceEuros < 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceEuros"],
        message: "Price looks too low. Leave empty for 'price on request'.",
      });
    }
  });

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export const statusChangeSchema = z.object({
  propertyId: z.string().uuid(),
  status: z.enum(PROPERTY_STATUSES),
  reason: z.string().trim().max(500).optional(),
  reservedUntil: z.string().datetime().optional(),
  leadId: z.string().uuid().optional(),
  depositEuros: z.coerce.number().min(0).max(100_000_000).optional(),
});

export const publicationChangeSchema = z.object({
  propertyId: z.string().uuid(),
  publication: z.enum(PUBLICATION_STATUSES),
});

export const archivePropertySchema = z.object({
  propertyId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/* ── Leads & visits ───────────────────────────────────────────────────── */

const phone = z
  .string()
  .trim()
  .max(32)
  .regex(/^[+()\-\s\d]{6,32}$/, "Enter a valid phone number.")
  .optional()
  .or(z.literal("").transform(() => undefined));

const consent = z
  .union([z.boolean(), z.literal("on"), z.literal("true")])
  .transform((v) => v === true || v === "on" || v === "true")
  .refine((v) => v, "Consent is required to process your enquiry.");

export const publicLeadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone,
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(1500),
  propertyId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  typology: z.enum(TYPOLOGIES).optional().or(z.literal("").transform(() => undefined)),
  source: z.enum(LEAD_SOURCES).default("website"),
  consent,
  /** Honeypot — must stay empty. */
  company: z.string().max(0, "Spam detected.").optional().or(z.literal("")),
});

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

export const leadUpdateSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const publicVisitSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone,
  propertyId: z.string().uuid("Choose a property."),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time."),
  notes: z.string().trim().max(1000).optional(),
  consent,
  company: z.string().max(0).optional().or(z.literal("")),
});

export type PublicVisitInput = z.infer<typeof publicVisitSchema>;

export const visitUpdateSchema = z.object({
  visitId: z.string().uuid(),
  status: z.enum(VISIT_STATUSES),
  adminNotes: z.string().trim().max(2000).optional(),
  preferredAt: z.string().datetime().optional(),
});

/* ── Scene ────────────────────────────────────────────────────────────── */

/**
 * Legal placement area for a house origin, in metres. Kept in the domain layer
 * because it is enforced by the placement schema and the repositories; the 3D
 * masterplan derives its perimeter fence from the same numbers so the editor,
 * the API and the rendered scene can never drift apart.
 */
export const SITE_BOUNDS = { minX: -100, maxX: 74, minZ: -66, maxZ: 80 } as const;

export const placementSchema = z.object({
  items: z
    .array(
      z.object({
        propertyId: z.string().uuid(),
        x: z.coerce.number().min(SITE_BOUNDS.minX).max(SITE_BOUNDS.maxX),
        z: z.coerce.number().min(SITE_BOUNDS.minZ).max(SITE_BOUNDS.maxZ),
        rotationY: z.coerce.number().min(-360).max(360),
      }),
    )
    .min(1)
    .max(13),
});

export const resetPlacementSchema = z.object({
  propertyId: z.string().uuid().optional(),
});

/* ── Assets & media ───────────────────────────────────────────────────── */

export const assetInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_.-]{2,60}$/, "Use an uppercase asset code."),
  role: z.enum(ASSET_ROLES),
  propertyId: z.string().uuid().nullable().optional(),
  typology: z.enum(TYPOLOGIES).nullable().optional(),
  storagePath: z.string().trim().min(1).max(500),
  format: z.enum(ASSET_FORMATS),
  version: z.string().trim().min(1).max(40),
  publication: z.enum(ASSET_PUBLICATION_STATES).default("draft"),
  validation: z.enum(ASSET_VALIDATION_STATES).default("pending"),
  widthM: z.coerce.number().positive().max(500).nullable().optional(),
  depthM: z.coerce.number().positive().max(500).nullable().optional(),
  heightM: z.coerce.number().positive().max(200).nullable().optional(),
  originNote: z.string().trim().max(300).optional(),
  orientation: z.string().trim().max(120).optional(),
  scaleNote: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const mediaInputSchema = z.object({
  propertyId: z.string().uuid(),
  kind: z.enum(MEDIA_KINDS),
  url: z.string().trim().min(1).max(1000),
  caption: z.string().trim().max(160).optional(),
  altText: z.string().trim().max(240).optional(),
});

/* ── Settings ─────────────────────────────────────────────────────────── */

export const settingsSchema = z.object({
  condominiumName: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  locationLabel: z.string().trim().max(120),
  contactEmail: z.string().trim().email().max(254),
  contactPhone: z.string().trim().max(32),
  currency: z.enum(CURRENCIES),
  demoMode: z.union([z.boolean(), z.literal("on")]).transform((v) => v === true || v === "on"),
  leadRetentionDays: z.coerce.number().int().min(30).max(3650),
  visitSlotMinutes: z.coerce.number().int().min(15).max(180),
  visitLeadTimeHours: z.coerce.number().int().min(0).max(720),
});

/* ── Utility ──────────────────────────────────────────────────────────── */

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    result[key] = [...(result[key] ?? []), issue.message];
  }
  return result;
}

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export const roleSchema = z.enum(ROLES);

export function normalizeRotation(value: number): number {
  let v = value % 360;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return Math.round(v * 1000) / 1000;
}
