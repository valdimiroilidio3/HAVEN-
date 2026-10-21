import type { Currency, LeadSource, PropertyStatus, PublicationStatus, Typology, VisitStatus } from "./types";

/**
 * Deterministic demonstration inventory.
 *
 * ⚠️  These areas, prices and specifications are DEMONSTRATION DATA.
 * They are internally consistent with the prototype plans but have not been
 * validated by an architect, a surveyor or the sales team. Every seeded
 * property carries `is_demo = true` and the UI surfaces that fact.
 */

export interface SeedUnit {
  code: string;
  title: string;
  typology: Typology;
  status: PropertyStatus;
  publication: PublicationStatus;
  position: { x: number; z: number; rotationY: number };
  usableAreaM2: number;
  outdoorAreaM2: number;
  plotAreaM2: number;
  priceCents: number;
  currency: Currency;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  features: string[];
  description: string;
}

const FEATURES: Record<Typology, string[]> = {
  T1: ["South-facing terrace", "Full-height glazing", "Stone and timber façade", "Heat-pump ready", "Private garden"],
  T2: [
    "Open-plan kitchen and dining",
    "Timber-decked terrace",
    "Dedicated study",
    "Ensuite master bedroom",
    "Private garden",
  ],
  T3: [
    "Full-width rear terrace",
    "Stone and timber façade",
    "Open-plan living",
    "Ensuite master suite",
    "Two additional bedrooms",
    "Laundry and pantry",
    "Private garden",
  ],
  T4: [
    "Double-height living volume",
    "Four bedrooms, three bathrooms",
    "Walk-in wardrobe",
    "Service wing with pantry",
    "Full-width garden deck",
    "Signature stone façade",
    "Private garden",
  ],
};

const DESCRIPTION: Record<Typology, string> = {
  T1: "A compact, light-filled house arranged around a private south-facing terrace. The living space, kitchen and bedroom are oriented to the garden, with a stone and timber façade that anchors the house into the landscape.",
  T2: "A balanced family house with an open social volume to the rear, a dedicated study and two bedrooms. The master suite opens onto its own timber terrace, while the living room faces the private garden.",
  T3: "A generous family house with a wide, open kitchen and dining area, a full-width rear terrace and three bedrooms. Service spaces — laundry, pantry and store — are kept discreetly to the side of the plan.",
  T4: "The signature residence of the condominium. A double-height living volume faces the garden deck, with four bedrooms, an ensuite master suite, walk-in wardrobe and a complete service wing. Designed as the largest and most private unit in the scheme.",
};

const UNIT_NAMES: Record<string, string> = {
  H01: "Olive",
  H02: "Cork",
  H03: "Fig",
  H04: "Almond",
  H05: "Cedar",
  H06: "Pine",
  H07: "Laurel",
  H08: "Myrtle",
  H09: "Carob",
  H10: "Jasmine",
  H11: "Arbutus",
  H12: "Oak",
  H13: "Stone",
};

/** Exact approved inventory: 3 × T1, 3 × T2, 4 × T3, 3 × T4. */
export const SEED_UNITS: SeedUnit[] = [
  {
    code: "H01",
    title: "Olive House",
    typology: "T1",
    status: "available",
    publication: "published",
    position: { x: -22, z: -31, rotationY: 0 },
    usableAreaM2: 70,
    outdoorAreaM2: 34,
    plotAreaM2: 240,
    priceCents: 39_500_000,
    currency: "EUR",
    bedrooms: 1,
    bathrooms: 1,
    parkingSpaces: 1,
    features: FEATURES.T1,
    description: DESCRIPTION.T1,
  },
  {
    code: "H02",
    title: "Cork House",
    typology: "T1",
    status: "available",
    publication: "published",
    position: { x: -9, z: -32, rotationY: 0 },
    usableAreaM2: 70,
    outdoorAreaM2: 30,
    plotAreaM2: 230,
    priceCents: 38_500_000,
    currency: "EUR",
    bedrooms: 1,
    bathrooms: 1,
    parkingSpaces: 1,
    features: FEATURES.T1,
    description: DESCRIPTION.T1,
  },
  {
    code: "H03",
    title: "Fig House",
    typology: "T1",
    status: "reserved",
    publication: "published",
    position: { x: 4, z: -32, rotationY: 0 },
    usableAreaM2: 72,
    outdoorAreaM2: 38,
    plotAreaM2: 255,
    priceCents: 42_000_000,
    currency: "EUR",
    bedrooms: 1,
    bathrooms: 1,
    parkingSpaces: 1,
    features: FEATURES.T1,
    description: DESCRIPTION.T1,
  },
  {
    code: "H04",
    title: "Almond House",
    typology: "T2",
    status: "available",
    publication: "published",
    position: { x: 18, z: -31, rotationY: 0 },
    usableAreaM2: 99,
    outdoorAreaM2: 52,
    plotAreaM2: 320,
    priceCents: 49_500_000,
    currency: "EUR",
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: FEATURES.T2,
    description: DESCRIPTION.T2,
  },
  {
    code: "H05",
    title: "Cedar House",
    typology: "T2",
    status: "available",
    publication: "draft",
    position: { x: 34.4, z: -20, rotationY: -90 },
    usableAreaM2: 99,
    outdoorAreaM2: 48,
    plotAreaM2: 310,
    priceCents: 48_000_000,
    currency: "EUR",
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: FEATURES.T2,
    description: DESCRIPTION.T2,
  },
  {
    code: "H06",
    title: "Pine House",
    typology: "T2",
    status: "sold",
    publication: "published",
    position: { x: 36, z: -10, rotationY: -90 },
    usableAreaM2: 101,
    outdoorAreaM2: 55,
    plotAreaM2: 330,
    priceCents: 51_000_000,
    currency: "EUR",
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: FEATURES.T2,
    description: DESCRIPTION.T2,
  },
  {
    code: "H07",
    title: "Laurel House",
    typology: "T3",
    status: "available",
    publication: "published",
    position: { x: 37, z: 7, rotationY: -90 },
    usableAreaM2: 138,
    outdoorAreaM2: 68,
    plotAreaM2: 440,
    priceCents: 64_000_000,
    currency: "EUR",
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    features: FEATURES.T3,
    description: DESCRIPTION.T3,
  },
  {
    code: "H08",
    title: "Myrtle House",
    typology: "T3",
    status: "reserved",
    publication: "published",
    position: { x: 37, z: 26, rotationY: -90 },
    usableAreaM2: 138,
    outdoorAreaM2: 74,
    plotAreaM2: 455,
    priceCents: 66_500_000,
    currency: "EUR",
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    features: FEATURES.T3,
    description: DESCRIPTION.T3,
  },
  {
    code: "H09",
    title: "Carob House",
    typology: "T3",
    status: "available",
    publication: "published",
    position: { x: 17, z: 34, rotationY: 180 },
    usableAreaM2: 139,
    outdoorAreaM2: 70,
    plotAreaM2: 450,
    priceCents: 65_000_000,
    currency: "EUR",
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    features: FEATURES.T3,
    description: DESCRIPTION.T3,
  },
  {
    code: "H10",
    title: "Jasmine House",
    typology: "T3",
    status: "available",
    publication: "published",
    position: { x: 1, z: 36, rotationY: 180 },
    usableAreaM2: 138,
    outdoorAreaM2: 64,
    plotAreaM2: 435,
    priceCents: 63_000_000,
    currency: "EUR",
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    features: FEATURES.T3,
    description: DESCRIPTION.T3,
  },
  {
    code: "H11",
    title: "Arbutus House",
    typology: "T4",
    status: "sold",
    publication: "published",
    position: { x: -12, z: 36, rotationY: 180 },
    usableAreaM2: 171,
    outdoorAreaM2: 92,
    plotAreaM2: 610,
    priceCents: 84_500_000,
    currency: "EUR",
    bedrooms: 4,
    bathrooms: 3,
    parkingSpaces: 2,
    features: FEATURES.T4,
    description: DESCRIPTION.T4,
  },
  {
    code: "H12",
    title: "Oak House",
    typology: "T4",
    status: "available",
    publication: "published",
    position: { x: -28.5, z: 34, rotationY: 180 },
    usableAreaM2: 171,
    outdoorAreaM2: 96,
    plotAreaM2: 625,
    priceCents: 86_000_000,
    currency: "EUR",
    bedrooms: 4,
    bathrooms: 3,
    parkingSpaces: 2,
    features: FEATURES.T4,
    description: DESCRIPTION.T4,
  },
  {
    code: "H13",
    title: "Stone House",
    typology: "T4",
    status: "hidden",
    publication: "draft",
    position: { x: -37, z: 12, rotationY: 90 },
    usableAreaM2: 174,
    outdoorAreaM2: 100,
    plotAreaM2: 640,
    priceCents: 89_500_000,
    currency: "EUR",
    bedrooms: 4,
    bathrooms: 3,
    parkingSpaces: 2,
    features: FEATURES.T4,
    description: DESCRIPTION.T4,
  },
];

export function slugFor(code: string, title: string): string {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${code.toLowerCase()}`;
}

export function unitName(code: string): string {
  return UNIT_NAMES[code] ?? code;
}

/** Media library shared by the demo properties (generated placeholder imagery). */
export const DEMO_GALLERY: Array<{ url: string; caption: string; alt: string; kind: "gallery" | "interior" }> = [
  {
    url: "/media/demo/villa-dusk.jpg",
    caption: "Garden façade at dusk",
    alt: "Modern stone and timber house illuminated at dusk",
    kind: "gallery",
  },
  {
    url: "/media/demo/living-kitchen.jpg",
    caption: "Living and kitchen",
    alt: "Open-plan living room and kitchen with timber stools",
    kind: "interior",
  },
  {
    url: "/media/demo/garden-suite.jpg",
    caption: "Garden suite",
    alt: "Glass-walled living space opening onto a lawn and pool-free deck",
    kind: "gallery",
  },
  {
    url: "/media/demo/double-height.jpg",
    caption: "Double-height living",
    alt: "Double-height living space with mezzanine and timber kitchen",
    kind: "interior",
  },
  {
    url: "/media/demo/pool-plan.jpg",
    caption: "Furnished plan study",
    alt: "Furnished plan study of a single-storey house",
    kind: "gallery",
  },
];

export interface SeedLead {
  key: string;
  propertyCode: string | null;
  typology: Typology | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  source: LeadSource;
  status: "new" | "contacted" | "qualified" | "viewing" | "won" | "lost" | "archived";
  consent: boolean;
  daysAgo: number;
  notes: string | null;
}

/** Fictional demonstration enquiries. Never use real personal data in seeds. */
export const SEED_LEADS: SeedLead[] = [
  {
    key: "lead-1",
    propertyCode: "H07",
    typology: "T3",
    name: "Demo Enquiry — A. Ribeiro",
    email: "demo.a.ribeiro@example.com",
    phone: "+351 900 000 101",
    message: "We would like to understand the orientation of the rear terrace and the garden dimensions.",
    source: "website",
    status: "new",
    consent: true,
    daysAgo: 0,
    notes: null,
  },
  {
    key: "lead-2",
    propertyCode: "H12",
    typology: "T4",
    name: "Demo Enquiry — M. Costa",
    email: "demo.m.costa@example.com",
    phone: "+351 900 000 102",
    message: "Interested in the four-bedroom houses. Is there flexibility on the kitchen specification?",
    source: "portal",
    status: "contacted",
    consent: true,
    daysAgo: 2,
    notes: "Called on Tuesday. Wants a second visit with family.",
  },
  {
    key: "lead-3",
    propertyCode: null,
    typology: "T2",
    name: "Demo Enquiry — J. Ferreira",
    email: "demo.j.ferreira@example.com",
    phone: null,
    message: "Looking for a two-bedroom house for full-time living. Which units face west?",
    source: "referral",
    status: "qualified",
    consent: true,
    daysAgo: 4,
    notes: "Referred by an existing owner. Budget aligned with T2.",
  },
  {
    key: "lead-4",
    propertyCode: "H03",
    typology: "T1",
    name: "Demo Enquiry — L. Santos",
    email: "demo.l.santos@example.com",
    phone: "+351 900 000 104",
    message: "Is the H03 reservation still active? We would like to be considered as a backup.",
    source: "website",
    status: "new",
    consent: true,
    daysAgo: 1,
    notes: null,
  },
  {
    key: "lead-5",
    propertyCode: "H09",
    typology: "T3",
    name: "Demo Enquiry — R. Almeida",
    email: "demo.r.almeida@example.com",
    phone: "+351 900 000 105",
    message: "Please send the floor plans and the current availability list.",
    source: "event",
    status: "new",
    consent: true,
    daysAgo: 0,
    notes: null,
  },
  {
    key: "lead-6",
    propertyCode: "H02",
    typology: "T1",
    name: "Demo Enquiry — P. Nunes",
    email: "demo.p.nunes@example.com",
    phone: null,
    message: "Considering a holiday home. What are the condominium charges?",
    source: "website",
    status: "lost",
    consent: false,
    daysAgo: 21,
    notes: "Consent withdrawn — data scheduled for deletion.",
  },
  {
    key: "lead-7",
    propertyCode: null,
    typology: null,
    name: "Demo Enquiry — C. Matos",
    email: "demo.c.matos@example.com",
    phone: "+351 900 000 107",
    message: "Architect looking for a collaboration on interior specification.",
    source: "other",
    status: "archived",
    consent: true,
    daysAgo: 30,
    notes: "Not a buyer. Archived.",
  },
];

export interface SeedVisit {
  key: string;
  propertyCode: string;
  leadKey: string;
  name: string;
  email: string;
  phone: string | null;
  daysFromNow: number;
  hour: number;
  status: VisitStatus;
  notes: string | null;
}

export const SEED_VISITS: SeedVisit[] = [
  {
    key: "visit-1",
    propertyCode: "H07",
    leadKey: "lead-1",
    name: "Demo Enquiry — A. Ribeiro",
    email: "demo.a.ribeiro@example.com",
    phone: "+351 900 000 101",
    daysFromNow: 3,
    hour: 11,
    status: "requested",
    notes: "Requested a weekday morning visit.",
  },
  {
    key: "visit-2",
    propertyCode: "H12",
    leadKey: "lead-2",
    name: "Demo Enquiry — M. Costa",
    email: "demo.m.costa@example.com",
    phone: "+351 900 000 102",
    daysFromNow: 1,
    hour: 15,
    status: "confirmed",
    notes: "Second visit, bringing family.",
  },
  {
    key: "visit-3",
    propertyCode: "H09",
    leadKey: "lead-5",
    name: "Demo Enquiry — R. Almeida",
    email: "demo.r.almeida@example.com",
    phone: "+351 900 000 105",
    daysFromNow: 5,
    hour: 10,
    status: "requested",
    notes: null,
  },
  {
    key: "visit-4",
    propertyCode: "H04",
    leadKey: "lead-3",
    name: "Demo Enquiry — J. Ferreira",
    email: "demo.j.ferreira@example.com",
    phone: null,
    daysFromNow: -4,
    hour: 16,
    status: "completed",
    notes: "Positive visit, requested a follow-up on financing.",
  },
  {
    key: "visit-5",
    propertyCode: "H10",
    leadKey: "lead-5",
    name: "Demo Enquiry — R. Almeida",
    email: "demo.r.almeida@example.com",
    phone: "+351 900 000 105",
    daysFromNow: -9,
    hour: 12,
    status: "cancelled",
    notes: "Cancelled by the visitor; new request created.",
  },
];

export const DEMO_SETTINGS = {
  condominiumName: "HAVEN® Vale do Sobreiro",
  tagline: "Thirteen houses. One quiet landscape.",
  locationLabel: "Algarve, Portugal",
  contactEmail: "studio@haven.example",
  contactPhone: "+351 900 000 000",
  currency: "EUR" as Currency,
  demoMode: true,
  leadRetentionDays: 365,
  visitSlotMinutes: 45,
  visitLeadTimeHours: 24,
};
