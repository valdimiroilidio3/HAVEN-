import { describe, expect, it } from "vitest";
import { validateUpload } from "@/lib/upload";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0, 0, 0]);
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe("upload validation", () => {
  it("accepts a real PNG", () => {
    expect(validateUpload({ filename: "photo.png", mimeType: "image/png", size: png.byteLength, bytes: png })).toMatchObject({
      ok: true,
      category: "image",
      extension: "png",
    });
  });

  it("accepts a GLB with the glTF magic header", () => {
    expect(validateUpload({ filename: "house.glb", mimeType: "model/gltf-binary", size: glb.byteLength + 1000, bytes: glb })).toMatchObject({
      ok: true,
      category: "model",
      extension: "glb",
    });
  });

  it("rejects a spoofed extension", () => {
    const result = validateUpload({ filename: "malware.png", mimeType: "image/png", size: 6, bytes: pdf });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported types", () => {
    const result = validateUpload({ filename: "script.js", mimeType: "text/javascript", size: 10, bytes: jpeg });
    expect(result.ok).toBe(false);
  });

  it("rejects files over the size limit", () => {
    const result = validateUpload({ filename: "huge.jpg", mimeType: "image/jpeg", size: 20 * 1024 * 1024, bytes: jpeg });
    expect(result.ok).toBe(false);
  });

  it("rejects path traversal names", () => {
    expect(validateUpload({ filename: "../etc/passwd.png", mimeType: "image/png", size: png.length, bytes: png }).ok).toBe(false);
  });

  it("accepts PDF documents", () => {
    expect(validateUpload({ filename: "plan.pdf", mimeType: "application/pdf", size: pdf.length, bytes: pdf })).toMatchObject({
      ok: true,
      category: "document",
      extension: "pdf",
    });
  });
});
