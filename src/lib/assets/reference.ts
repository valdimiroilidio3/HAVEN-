import type { Typology } from "@/lib/domain/types";

/**
 * Model reference contract.
 *
 * A property stores stable strings in `exterior_model_ref`, `interior_model_ref`
 * and `floor_plan_ref`. Supported forms:
 *
 *   procedural:<role>:<typology>@<version>   prototype geometry generated from the plan
 *   asset:<CODE>                              resolve through the model_assets registry
 *   /uploads/models/name.glb                  locally uploaded GLB
 *   https://…/name.glb                        externally hosted GLB
 *
 * Property identity never depends on the reference: replacing an asset only
 * updates the reference/registry row, never the property id or code.
 */

export type AssetFormat = "glb" | "gltf" | "obj" | "jpg" | "png" | "webp" | "svg" | "pdf" | "procedural";

export interface AssetIndexEntry {
  code: string;
  storagePath: string;
  format: AssetFormat;
  version: string;
  role: "site" | "exterior" | "interior" | "floorplan";
  typology: Typology | null;
}

export type ResolvedModelRef =
  | { kind: "procedural"; role: string; typology: Typology | null; version: string }
  | { kind: "url"; url: string; format: "glb" | "gltf" | "obj" }
  | { kind: "missing"; reason: string };

const MODEL_EXTENSIONS = [".glb", ".gltf", ".obj"] as const;

export function isModelUrl(url: string): boolean {
  const clean = url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  return MODEL_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

export function modelFormatFromUrl(url: string): "glb" | "gltf" | "obj" | null {
  const clean = url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".glb")) return "glb";
  if (clean.endsWith(".gltf")) return "gltf";
  if (clean.endsWith(".obj")) return "obj";
  return null;
}

export function parseModelRef(ref: string | null | undefined, index: AssetIndexEntry[] = []): ResolvedModelRef {
  const value = (ref ?? "").trim();
  if (!value) return { kind: "missing", reason: "No model reference is set for this property." };

  if (value.startsWith("procedural:")) {
    const parts = value.split(":");
    const role = parts[1] ?? "exterior";
    const typologyPart = (parts[2] ?? "").split("@")[0] ?? "";
    const version = parts[2]?.split("@")[1] ?? "1";
    const typology = ["T1", "T2", "T3", "T4"].includes(typologyPart) ? (typologyPart as Typology) : null;
    return { kind: "procedural", role, typology, version };
  }

  if (value.startsWith("asset:")) {
    const code = value.slice("asset:".length);
    const entry = index.find((a) => a.code === code);
    if (!entry) return { kind: "missing", reason: `Asset ${code} is not registered or has been removed.` };
    if (entry.format === "procedural") {
      return { kind: "procedural", role: entry.role, typology: entry.typology, version: entry.version };
    }
    if (!isModelUrl(entry.storagePath)) {
      return { kind: "missing", reason: `Asset ${code} does not point to a supported model file.` };
    }
    const format = modelFormatFromUrl(entry.storagePath);
    if (!format) return { kind: "missing", reason: `Asset ${code} has an unsupported model format.` };
    return { kind: "url", url: entry.storagePath, format };
  }

  if (value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://")) {
    const format = modelFormatFromUrl(value);
    if (!format) return { kind: "missing", reason: "The model URL does not end with .glb, .gltf or .obj." };
    return { kind: "url", url: value, format };
  }

  return { kind: "missing", reason: "Unrecognised model reference format." };
}

export function buildAssetIndex(
  assets: Array<{ code: string; storagePath: string; format: string; version: string; role: string; typology: string | null; publication: string }>,
): AssetIndexEntry[] {
  return assets
    .filter((a) => a.publication !== "archived")
    .map((a) => ({
      code: a.code,
      storagePath: a.storagePath,
      format: a.format as AssetFormat,
      version: a.version,
      role: a.role as AssetIndexEntry["role"],
      typology: (a.typology as Typology | null) ?? null,
    }));
}
