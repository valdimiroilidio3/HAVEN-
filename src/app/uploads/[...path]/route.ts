import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { uploadsRoot } from "@/lib/db";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  pdf: "application/pdf",
  svg: "image/svg+xml",
};

/**
 * Serve locally stored uploads with a strict allowlist and path-traversal
 * protection. In Supabase mode media URLs point at Storage instead.
 */
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  if (!segments || segments.length === 0) return new Response("Not found", { status: 404 });

  const relative = segments.join("/");
  if (relative.includes("..") || relative.startsWith("/") || relative.includes("\\")) {
    return new Response("Not found", { status: 404 });
  }
  const root = path.resolve(uploadsRoot());
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });

  const extension = path.extname(target).slice(1).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new Response("Unsupported media type", { status: 415 });

  try {
    const info = await stat(target);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    const nodeStream = createReadStream(target);
    const stream = Readable.toWeb(nodeStream) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${path.basename(target)}"`,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
