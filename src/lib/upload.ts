/**
 * Upload validation. Pure functions (testable in Node) used by the server
 * action before anything touches disk or object storage.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_MODEL_BYTES = 40 * 1024 * 1024; // 40 MB
export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MODEL_TYPES: Record<string, string> = {
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
  "application/octet-stream": "glb",
};

const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/svg+xml": "svg",
};

export type UploadCategory = "image" | "model" | "document";

export interface UploadValidation {
  ok: boolean;
  category?: UploadCategory;
  extension?: string;
  contentType?: string;
  error?: string;
}

function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** Verify magic bytes so a renamed executable cannot masquerade as an image. */
export function sniff(bytes: Uint8Array): UploadCategory | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image"; // PNG
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length > 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image"; // WEBP
  }
  if (startsWithBytes(bytes, [0x67, 0x6c, 0x54, 0x46])) return "model"; // glTF (glTF)
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46])) return "document"; // PDF
  if (startsWithBytes(bytes, [0x3c, 0x3f, 0x78, 0x6d, 0x6c]) || startsWithBytes(bytes, [0x3c, 0x73, 0x76, 0x67])) {
    return "document";
  }
  return null;
}

export function validateUpload(input: {
  filename: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}): UploadValidation {
  const mime = input.mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  const lowerName = input.filename.toLowerCase();

  if (lowerName.includes("..") || /[/\\]/.test(lowerName)) {
    return { ok: false, error: "Invalid file name." };
  }
  if (input.size <= 0) return { ok: false, error: "The file is empty." };

  let category: UploadCategory;
  let extension: string;
  let maxBytes: number;

  if (IMAGE_TYPES[mime]) {
    category = "image";
    extension = IMAGE_TYPES[mime]!;
    maxBytes = MAX_IMAGE_BYTES;
  } else if (MODEL_TYPES[mime]) {
    category = "model";
    extension = MODEL_TYPES[mime]!;
    maxBytes = MAX_MODEL_BYTES;
  } else if (DOCUMENT_TYPES[mime]) {
    category = "document";
    extension = DOCUMENT_TYPES[mime]!;
    maxBytes = MAX_DOCUMENT_BYTES;
  } else {
    return { ok: false, error: `Unsupported file type (${mime || "unknown"}).` };
  }

  if (input.size > maxBytes) {
    return { ok: false, error: `File is too large. Maximum ${Math.round(maxBytes / 1024 / 1024)} MB for this format.` };
  }

  const sniffed = sniff(input.bytes);
  if (!sniffed) return { ok: false, error: "File contents do not match a supported format." };
  if (sniffed !== category) return { ok: false, error: "File contents do not match its declared type." };

  // glTF JSON is text; accept .gltf content declared as json/binary.
  if (category === "model" && extension === "glb" && !startsWithBytes(input.bytes, [0x67, 0x6c, 0x54, 0x46])) {
    return { ok: false, error: "GLB files must start with the glTF binary header." };
  }

  return { ok: true, category, extension, contentType: mime };
}

export function extensionForMime(mime: string): string | null {
  return IMAGE_TYPES[mime] ?? MODEL_TYPES[mime] ?? DOCUMENT_TYPES[mime] ?? null;
}
