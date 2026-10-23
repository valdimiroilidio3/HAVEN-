"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Upload } from "lucide-react";
import { uploadAssetAction, type AdminState } from "@/lib/actions/admin";
import { TYPOLOGIES } from "@/lib/domain/constants";
import type { Property } from "@/lib/domain/types";
import { inputClass, labelClass } from "@/components/public/forms";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-sm bg-obsidian px-4 text-xs font-medium text-porcelain hover:bg-ink-800 disabled:opacity-50">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
      {pending ? "Uploading…" : "Upload model"}
    </button>
  );
}

export function AssetUploadForm({ properties }: { properties: Property[] }) {
  const [state, formAction] = useActionState<AdminState, FormData>(uploadAssetAction, null);
  const [role, setRole] = React.useState<"exterior" | "interior">("exterior");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="asset-code" className={labelClass}>
            Asset code
          </label>
          <input id="asset-code" name="code" placeholder="EXT-T5" className={inputClass} required />
        </div>
        <div>
          <label htmlFor="asset-role" className={labelClass}>
            Role
          </label>
          <select id="asset-role" name="role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} className={inputClass}>
            <option value="exterior">Exterior</option>
            <option value="interior">Interior</option>
          </select>
        </div>
        <div>
          <label htmlFor="asset-version" className={labelClass}>
            Version
          </label>
          <input id="asset-version" name="version" defaultValue="1" className={inputClass} />
        </div>
        <div>
          <label htmlFor="asset-typology" className={labelClass}>
            Typology (optional)
          </label>
          <select id="asset-typology" name="typology" className={inputClass}>
            <option value="">Any / site</option>
            {TYPOLOGIES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="asset-property" className={labelClass}>
            Specific home (optional)
          </label>
          <select id="asset-property" name="propertyId" className={inputClass}>
            <option value="">Not specific</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.code} · {property.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="asset-file" className={labelClass}>
            GLB file
          </label>
          <input id="asset-file" name="file" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" className={`${inputClass} py-2 text-[0.7rem]`} required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="asset-w" className={labelClass}>
            Width (m)
          </label>
          <input id="asset-w" name="widthM" type="number" step="0.01" className={inputClass} />
        </div>
        <div>
          <label htmlFor="asset-d" className={labelClass}>
            Depth (m)
          </label>
          <input id="asset-d" name="depthM" type="number" step="0.01" className={inputClass} />
        </div>
        <div>
          <label htmlFor="asset-h" className={labelClass}>
            Height (m)
          </label>
          <input id="asset-h" name="heightM" type="number" step="0.01" className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="asset-origin" className={labelClass}>
          Origin note
        </label>
        <input id="asset-origin" name="originNote" className={inputClass} placeholder="Origin at ground centre, +Y up, doors on +Z" />
      </div>
      <p className="text-[0.65rem] leading-relaxed text-ink-400">
        Uploads stay unpublished until an administrator validates the scale and marks them published. GLB only (glTF binary) up to 40 MB.
      </p>
      {state && !state.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{state.data.message}</p>}
      <Submit />
    </form>
  );
}
