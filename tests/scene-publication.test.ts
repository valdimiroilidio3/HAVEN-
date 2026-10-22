import { describe, expect, it } from "vitest";
import {
  PUBLICATION_POLICY,
  draftFingerprint,
  evaluatePublication,
  summarisePublication,
  warningLines,
  type PublicationIssue,
} from "@/lib/domain/scene-publication";

const finding = (severity: PublicationIssue["severity"], objectId = "H01/house"): PublicationIssue => ({
  objectId,
  subject: objectId.split("/")[0]!,
  severity,
  category: "circulation",
  message: `${objectId} is wrong.`,
  suggestion: "Move it.",
});

describe("publication policy", () => {
  it("blocks at the same threshold as the strict audit gate", () => {
    expect(PUBLICATION_POLICY.blocking).toEqual(["critical", "high"]);
    expect(PUBLICATION_POLICY.reported).toEqual(["medium", "low"]);
  });

  it("splits findings without dropping or promoting any", () => {
    const findings = [finding("critical"), finding("high", "H02/house"), finding("medium", "path/ring-outer"), finding("low", "lamp@1")];
    const evaluation = evaluatePublication({ findings });

    expect(evaluation.ok).toBe(false);
    expect(evaluation.blocking.map((issue) => issue.objectId)).toEqual(["H01/house", "H02/house"]);
    expect(evaluation.warnings.map((issue) => issue.objectId)).toEqual(["path/ring-outer", "lamp@1"]);
    // Nothing is hidden and nothing is invented.
    expect(evaluation.blocking.length + evaluation.warnings.length).toBe(findings.length);
    expect(evaluation.warnings[0]!.suggestion).toBe("Move it.");
  });

  it("lets a scene with warnings only publish", () => {
    const evaluation = evaluatePublication({ findings: [finding("medium"), finding("low")] });
    expect(evaluation.ok).toBe(true);
    expect(evaluation.blocking).toEqual([]);
    expect(summarisePublication(evaluation)).toBe("Validated with 2 recorded warnings.");
  });

  it("describes a clean scene and a blocked one differently", () => {
    expect(summarisePublication(evaluatePublication({ findings: [] }))).toBe("Validated with no findings.");
    expect(summarisePublication(evaluatePublication({ findings: [finding("critical")] }))).toMatch(/blocked/i);
  });

  it("keeps a warning line per recorded finding", () => {
    const lines = warningLines(evaluatePublication({ findings: [finding("medium", "path/ring-outer")] }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[medium]");
    expect(lines[0]).toContain("path/ring-outer");
  });
});

describe("draft fingerprint", () => {
  const scene = [
    { propertyId: "a", x: 1, z: 2, rotationY: 0 },
    { propertyId: "b", x: -3.5, z: 4, rotationY: 90 },
  ];

  it("is order independent", () => {
    expect(draftFingerprint(scene)).toBe(draftFingerprint([...scene].reverse()));
  });

  it("changes when any coordinate, rotation or member changes", () => {
    const base = draftFingerprint(scene);
    expect(draftFingerprint([{ ...scene[0]!, x: 1.001 }, scene[1]!])).not.toBe(base);
    expect(draftFingerprint([{ ...scene[0]!, rotationY: 180 }, scene[1]!])).not.toBe(base);
    expect(draftFingerprint([scene[0]!])).not.toBe(base);
  });

  it("carries the row count so a removed home is visible", () => {
    expect(draftFingerprint(scene).endsWith(":2")).toBe(true);
  });

  it("is empty-safe", () => {
    expect(draftFingerprint([])).toMatch(/^[0-9a-f]{8}:0$/);
  });
});
