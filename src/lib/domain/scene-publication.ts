/**
 * Publication policy for the masterplan.
 *
 * The scene is validated in the browser while it is edited (live feedback) and
 * again on the server, immediately before publishing. This module holds the part
 * both sides must agree on, and nothing that needs a database or a DOM:
 *
 *   - the blocking threshold,
 *   - the mapping from `validateScene` findings to publishable issues,
 *   - the draft fingerprint used to detect a draft that changed in between.
 *
 * There is exactly one validation engine (`lib/3d/validate.ts`). This file only
 * decides what to do with its findings; it never re-implements a rule.
 */

/** The minimum a placement needs to be validated and fingerprinted. */
export interface PublicationPlacement {
  propertyId: string;
  x: number;
  z: number;
  rotationY: number;
}

export type PublicationSeverity = "critical" | "high" | "medium" | "low";

/** A finding reduced to what the publish UI can show and act on. */
export interface PublicationIssue {
  objectId: string;
  subject: string;
  severity: PublicationSeverity;
  category: string;
  message: string;
  suggestion: string;
}

/** Structural shape of `SceneReport`, so this module does not import the 3D layer. */
export interface PublicationReport {
  findings: ReadonlyArray<{
    objectId: string;
    subject: string;
    severity: PublicationSeverity;
    category: string;
    message: string;
    suggestion: string;
  }>;
}

/**
 * Same threshold as `npm run audit:3d --strict` (scripts/scene-audit.ts): a scene
 * that fails the build gate cannot be published either. Medium and low findings
 * are not ignored — they are recorded in the activity log and shown in the
 * result — but they do not block, because they describe improvements rather than
 * defects (the H13 footway corridor is one of them).
 */
export const PUBLICATION_POLICY = {
  blocking: ["critical", "high"] as const,
  reported: ["medium", "low"] as const,
} as const;

/** Draft fingerprint: order-independent, locale-independent, stable. */
export function draftFingerprint(placements: readonly PublicationPlacement[]): string {
  const canonical = [...placements]
    .sort((a, b) => a.propertyId.localeCompare(b.propertyId))
    .map((item) => `${item.propertyId}@${item.x.toFixed(3)},${item.z.toFixed(3)},${item.rotationY.toFixed(3)}`)
    .join("|");
  // FNV-1a, 32 bit. Small, dependency-free and synchronous — the same result in
  // a React client, a Node action and a test.
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}:${placements.length}`;
}

export interface PublicationEvaluation {
  ok: boolean;
  blocking: PublicationIssue[];
  warnings: PublicationIssue[];
}

/** Split findings into the ones that stop a publication and the ones recorded. */
export function evaluatePublication(report: PublicationReport): PublicationEvaluation {
  const blocking: PublicationIssue[] = [];
  const warnings: PublicationIssue[] = [];
  for (const finding of report.findings) {
    const issue: PublicationIssue = {
      objectId: finding.objectId,
      subject: finding.subject,
      severity: finding.severity,
      category: finding.category,
      message: finding.message,
      suggestion: finding.suggestion,
    };
    if ((PUBLICATION_POLICY.blocking as readonly string[]).includes(finding.severity)) blocking.push(issue);
    else warnings.push(issue);
  }
  return { ok: blocking.length === 0, blocking, warnings };
}

/** One-line summary for the admin toast. */
export function summarisePublication(evaluation: PublicationEvaluation): string {
  if (evaluation.ok && evaluation.warnings.length === 0) return "Validated with no findings.";
  if (evaluation.ok) {
    return `Validated with ${evaluation.warnings.length} recorded warning${evaluation.warnings.length === 1 ? "" : "s"}.`;
  }
  return `Publication blocked: ${evaluation.blocking.length} finding${evaluation.blocking.length === 1 ? "" : "s"} at or above the blocking threshold.`;
}

/** Warnings as plain strings, for the activity log and the admin result. */
export function warningLines(evaluation: PublicationEvaluation): string[] {
  return evaluation.warnings.map((issue) => `[${issue.severity}] ${issue.objectId}: ${issue.message}`);
}
