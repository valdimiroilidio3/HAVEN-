"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { assignModelAction, type AdminState } from "@/lib/actions/admin";
import type { ModelAsset } from "@/lib/domain/types";
import { inputClass, labelClass } from "@/components/public/forms";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-sm border border-ink-900/15 bg-white px-4 text-xs font-medium text-obsidian hover:border-ink-900/35 disabled:opacity-50">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {pending ? "Replacing…" : "Replace model"}
    </button>
  );
}

export function ModelAssign({ propertyId, assets }: { propertyId: string; assets: ModelAsset[] }) {
  const [state, formAction] = useActionState<AdminState, FormData>(assignModelAction, null);
  const [role, setRole] = React.useState<"exterior" | "interior">("exterior");
  const eligible = assets.filter((asset) => asset.role === role && asset.publication === "published" && asset.validation === "validated");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="model-role" className={labelClass}>
            Model role
          </label>
          <select id="model-role" name="role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} className={inputClass}>
            <option value="exterior">Exterior</option>
            <option value="interior">Interior</option>
          </select>
        </div>
        <div>
          <label htmlFor="assetId" className={labelClass}>
            Validated asset
          </label>
          <select id="assetId" name="assetId" className={inputClass} required disabled={eligible.length === 0}>
            {eligible.length === 0 && <option value="">No validated {role} assets</option>}
            {eligible.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.code} · v{asset.version}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[0.65rem] leading-relaxed text-ink-400">
        Only assets that are validated and published can replace the generated model. Replacing keeps the previous file for audit; the public viewer falls back to the procedural model if a file fails to load.
      </p>
      {state && !state.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{state.data.message}</p>}
      <Submit />
    </form>
  );
}
