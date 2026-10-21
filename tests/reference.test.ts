import { describe, expect, it } from "vitest";
import { buildAssetIndex, parseModelRef } from "@/lib/assets/reference";

const index = buildAssetIndex([
  { code: "HAVEN-EXT-T2", storagePath: "procedural://exterior/T2/v1", format: "procedural", version: "1", role: "exterior", typology: "T2", publication: "published" },
  { code: "HAVEN-EXT-T3-GLB", storagePath: "/uploads/models/t3.glb", format: "glb", version: "2", role: "exterior", typology: "T3", publication: "published" },
  { code: "HAVEN-EXT-ARCHIVED", storagePath: "/uploads/models/old.glb", format: "glb", version: "1", role: "exterior", typology: "T4", publication: "archived" },
]);

describe("model reference contract", () => {
  it("parses procedural references", () => {
    expect(parseModelRef("procedural:interior:T3@2")).toEqual({ kind: "procedural", role: "interior", typology: "T3", version: "2" });
  });

  it("resolves registered procedural assets", () => {
    expect(parseModelRef("asset:HAVEN-EXT-T2", index)).toMatchObject({ kind: "procedural", typology: "T2" });
  });

  it("resolves registered GLB assets", () => {
    expect(parseModelRef("asset:HAVEN-EXT-T3-GLB", index)).toEqual({ kind: "url", url: "/uploads/models/t3.glb", format: "glb" });
  });

  it("reports missing assets instead of throwing", () => {
    expect(parseModelRef("asset:DOES-NOT-EXIST", index).kind).toBe("missing");
    expect(parseModelRef("asset:HAVEN-EXT-ARCHIVED", index).kind).toBe("missing");
  });

  it("rejects unsupported URLs", () => {
    expect(parseModelRef("/media/demo/villa.jpg", index).kind).toBe("missing");
    expect(parseModelRef("", index).kind).toBe("missing");
  });

  it("accepts direct model URLs", () => {
    expect(parseModelRef("https://cdn.example.com/house.glb?x=1", index)).toEqual({
      kind: "url",
      url: "https://cdn.example.com/house.glb?x=1",
      format: "glb",
    });
  });
});
