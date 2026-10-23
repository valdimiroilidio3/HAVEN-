"use client";

import * as React from "react";
import Image from "next/image";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { deleteMediaAction, uploadMediaAction, type AdminState } from "@/lib/actions/admin";
import type { PropertyMedia } from "@/lib/domain/types";
import { inputClass, labelClass } from "@/components/public/forms";
import { cn } from "@/lib/utils";

function Submit({ label, icon }: { label: string; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-2 rounded-sm bg-obsidian px-4 text-xs font-medium text-porcelain transition hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {pending ? "Uploading…" : label}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Delete media"
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-ink-900/15 bg-white text-ink-500 transition hover:border-[#8a2f22]/40 hover:text-[#8a2f22] disabled:opacity-40"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

export function MediaManager({ propertyId, media }: { propertyId: string; media: PropertyMedia[] }) {
  const [uploadState, uploadAction] = useActionState<AdminState, FormData>(uploadMediaAction, null);
  const [deleteState, deleteAction] = useActionState<AdminState, FormData>(deleteMediaAction, null);
  const [kind, setKind] = React.useState<"gallery" | "plan" | "hero">("gallery");

  return (
    <div className="space-y-5">
      {media.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-sm border border-ink-900/10 bg-white">
              <div className="relative aspect-[4/3] bg-ink-50">
                {item.kind === "plan" ? (
                  <div className="flex h-full items-center justify-center text-[0.65rem] uppercase tracking-[0.14em] text-ink-400">Floor plan</div>
                ) : (
                  <Image src={item.url} alt={item.altText ?? item.caption ?? ""} fill sizes="(max-width: 640px) 50vw, 200px" className="object-cover" unoptimized />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.62rem] uppercase tracking-[0.1em] text-ink-400">{item.kind}</p>
                  <p className="truncate text-[0.68rem] text-ink-600">{item.caption ?? item.altText ?? "—"}</p>
                </div>
                <form
                  action={deleteAction}
                  onSubmit={(event) => {
                    if (!window.confirm("Delete this media? This cannot be undone.")) event.preventDefault();
                  }}
                >
                  <input type="hidden" name="mediaId" value={item.id} />
                  <DeleteButton />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {media.length === 0 && <p className="text-[0.78rem] text-ink-400">No media yet. Upload a hero image, gallery photography or the plan reference.</p>}

      <form action={uploadAction} className="space-y-3 border-t border-ink-900/10 pt-4">
        <input type="hidden" name="propertyId" value={propertyId} />
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <label htmlFor="file" className={labelClass}>
              File
            </label>
            <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className={cn(inputClass, "py-2 text-[0.7rem] file:mr-3 file:rounded-sm file:border-0 file:bg-ink-900/[0.06] file:px-2 file:py-1 file:text-[0.65rem]")} required />
          </div>
          <div>
            <label htmlFor="kind" className={labelClass}>
              Usage
            </label>
            <select id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className={inputClass}>
              <option value="gallery">Gallery</option>
              <option value="hero">Hero</option>
              <option value="plan">Floor plan</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="caption" className={labelClass}>
              Caption (optional)
            </label>
            <input id="caption" name="caption" className={inputClass} placeholder="Living room, morning light" />
          </div>
          <div>
            <label htmlFor="altText" className={labelClass}>
              Alt text (accessibility)
            </label>
            <input id="altText" name="altText" className={inputClass} placeholder="Describe the image for screen readers" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Submit label="Upload media" icon={<ImagePlus className="h-3.5 w-3.5" aria-hidden />} />
          <p className="text-[0.65rem] text-ink-400">JPEG, PNG, WebP or AVIF up to 8 MB. Images are used on the public property page.</p>
        </div>
        {uploadState && !uploadState.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{uploadState.error}</p>}
        {uploadState?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{uploadState.data.message}</p>}
        {deleteState && !deleteState.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{deleteState.error}</p>}
        {deleteState?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{deleteState.data.message}</p>}
      </form>
    </div>
  );
}
