import { can } from "./constants";
import type { PropertyStatus, PublicationStatus, Role } from "./types";

/** Explicit, authorised commercial status transitions. */
export const STATUS_TRANSITIONS: Record<PropertyStatus, readonly PropertyStatus[]> = {
  available: ["reserved", "sold", "hidden"],
  reserved: ["available", "sold", "hidden"],
  sold: ["hidden", "available"],
  hidden: ["available", "reserved"],
};

/** Transitions restricted to specific roles even when the transition exists. */
const TRANSITION_ROLES: Partial<Record<`${PropertyStatus}->${PropertyStatus}`, readonly Role[]>> = {
  "sold->available": ["admin"],
};

export function canTransitionStatus(role: Role, from: PropertyStatus, to: PropertyStatus): boolean {
  if (from === to) return false;
  if (!STATUS_TRANSITIONS[from].includes(to)) return false;
  if (!can(role, "property:status")) return false;
  const restricted = TRANSITION_ROLES[`${from}->${to}`];
  if (restricted) return restricted.includes(role);
  return true;
}

/** A status change that requires a sale/reservation record to exist. */
export function requiresSaleRecord(to: PropertyStatus): boolean {
  return to === "sold";
}

export function statusTransitionError(role: Role, from: PropertyStatus, to: PropertyStatus): string | null {
  if (from === to) return `Property is already ${from}.`;
  if (!STATUS_TRANSITIONS[from].includes(to)) return `A property cannot move directly from ${from} to ${to}.`;
  if (!can(role, "property:status")) return "Your role is not permitted to change commercial status.";
  const restricted = TRANSITION_ROLES[`${from}->${to}`];
  if (restricted && !restricted.includes(role)) {
    return "Reopening a sold property requires an administrator.";
  }
  return null;
}

const PUBLICATION_TRANSITIONS: Record<PublicationStatus, readonly PublicationStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: [],
};

export function canTransitionPublication(from: PublicationStatus, to: PublicationStatus): boolean {
  return from !== to && PUBLICATION_TRANSITIONS[from].includes(to);
}

/**
 * Business rules for a valid commercial state combination.
 * Returns an error message or null.
 */
export function validateStateCombination(status: PropertyStatus, publication: PublicationStatus): string | null {
  if (publication === "archived" && status !== "hidden" && status !== "sold") {
    return "Archiving requires the property to be hidden or sold so that it leaves commercial channels.";
  }
  if (publication === "published" && status === "hidden") {
    return "A hidden property cannot be published. Set it back to available first.";
  }
  return null;
}
