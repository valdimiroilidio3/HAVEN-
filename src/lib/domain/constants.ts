export { TYPOLOGIES, PROPERTY_STATUSES, PUBLICATION_STATUSES, CURRENCIES, LEAD_STATUSES, VISIT_STATUSES } from "./types";

import type {
  AssetRole,
  Currency,
  LeadSource,
  LeadStatus,
  MediaKind,
  PropertyStatus,
  PublicationStatus,
  Role,
  Typology,
  VisitStatus,
} from "./types";

/** Typology catalogue. Totals are fixed by the approved brief. */
export const TYPOLOGY_CATALOGUE: Record<
  Typology,
  {
    label: string;
    short: string;
    bedrooms: number;
    homes: number;
    description: string;
    character: string;
  }
> = {
  T1: {
    label: "T1",
    short: "One bedroom",
    bedrooms: 1,
    homes: 3,
    description: "Smart plans, contemporary design and efficient, functional spaces.",
    character: "Garden studio living",
  },
  T2: {
    label: "T2",
    short: "Two bedrooms",
    bedrooms: 2,
    homes: 3,
    description: "A balance between comfort, privacy and generously scaled social areas.",
    character: "Family starter home",
  },
  T3: {
    label: "T3",
    short: "Three bedrooms",
    bedrooms: 3,
    homes: 4,
    description: "Family houses with ample spaces and a direct connection to the garden.",
    character: "Family house",
  },
  T4: {
    label: "T4",
    short: "Four bedrooms",
    bedrooms: 4,
    homes: 3,
    description: "The largest typology, with potential for terrace, private garden and spacious suites.",
    character: "Signature residence",
  },
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  hidden: "Hidden",
};

export const PROPERTY_STATUS_HINTS: Record<PropertyStatus, string> = {
  available: "Can be marketed and reserved.",
  reserved: "Held under an active reservation.",
  sold: "Closed sale — history preserved.",
  hidden: "Withheld from commercial channels.",
};

export const PUBLICATION_LABELS: Record<PublicationStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  manager: "Manager",
  viewer: "Read-only",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  viewing: "Viewing",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Website",
  referral: "Referral",
  portal: "Portal",
  walk_in: "Walk-in",
  event: "Event",
  other: "Other",
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  gallery: "Gallery",
  plan: "Floor plan",
  exterior: "Exterior",
  interior: "Interior",
  video: "Video",
};

export const ASSET_ROLE_LABELS: Record<AssetRole, string> = {
  site: "Site",
  exterior: "Exterior",
  interior: "Interior",
  floorplan: "Floor plan",
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£" };

/**
 * Role capability matrix. Enforced server-side (see lib/auth + lib/services)
 * and mirrored in the UI only to avoid dead-end interactions.
 */
export const CAPABILITIES = {
  "property:update": ["admin", "manager"],
  "property:create": ["admin", "manager"],
  "property:archive": ["admin"],
  "property:status": ["admin", "manager"],
  "property:reopen-sale": ["admin"],
  "lead:update": ["admin", "manager"],
  "lead:delete": ["admin"],
  "visit:update": ["admin", "manager"],
  "scene:edit-draft": ["admin", "manager"],
  "scene:publish": ["admin"],
  "media:upload": ["admin", "manager"],
  "media:delete": ["admin"],
  "settings:update": ["admin"],
  "profile:manage": ["admin"],
  "activity:read": ["admin", "manager"],
  "content:read": ["admin", "manager", "viewer"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

export const DEMO_DISCLAIMER =
  "Demonstration data. Areas, prices and specifications are prototypes pending architectural and commercial validation.";
