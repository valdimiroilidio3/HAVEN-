import "server-only";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataGateway } from "@/lib/db/gateway";
import { uploadsRoot } from "@/lib/db";
import { SupabaseGateway } from "@/lib/db/supabase";
import { validateUpload } from "@/lib/upload";
import { DomainError } from "@/lib/domain/errors";

/**
 * Store an uploaded file.
 *  - local driver: writes to HAVEN_DATA_DIR/uploads and serves via /uploads/…
 *  - Supabase driver: uploads to the configured Storage bucket with the service
 *    role and returns the public URL.
 * Validation happens before this function is called (see lib/upload.ts).
 */
export async function storeUpload(
  db: DataGateway,
  file: File,
  options: { prefix: "media" | "models" | "documents" },
): Promise<{ url: string; filename: string; size: number; contentType: string; extension: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const validation = validateUpload({
    filename: file.name,
    mimeType: file.type,
    size: bytes.byteLength,
    bytes,
  });
  if (!validation.ok || !validation.extension || !validation.contentType) {
    throw new DomainError(validation.error ?? "Invalid upload.");
  }

  const filename = `${options.prefix}-${randomUUID()}.${validation.extension}`;

  if (db.driver === "supabase" && db instanceof SupabaseGateway) {
    const bucket = process.env.SUPABASE_MEDIA_BUCKET || "haven-media";
    const url = await db.upload(bucket, filename, arrayBuffer, validation.contentType);
    return { url, filename, size: bytes.byteLength, contentType: validation.contentType, extension: validation.extension };
  }

  const destination = path.join(uploadsRoot(), filename);
  const resolved = path.resolve(destination);
  if (!resolved.startsWith(path.resolve(uploadsRoot()) + path.sep)) {
    throw new DomainError("Invalid upload destination.");
  }
  await writeFile(resolved, bytes);
  return {
    url: `/uploads/${filename}`,
    filename,
    size: bytes.byteLength,
    contentType: validation.contentType,
    extension: validation.extension,
  };
}
