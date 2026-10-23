"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { updateSettingsAction, type AdminState } from "@/lib/actions/admin";
import { CURRENCIES } from "@/lib/domain/constants";
import type { AppSettings } from "@/lib/domain/types";
import { inputClass, labelClass } from "@/components/public/forms";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-sm bg-obsidian px-5 text-[0.8rem] font-medium text-porcelain hover:bg-ink-800 disabled:opacity-50">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction] = useActionState<AdminState, FormData>(updateSettingsAction, null);

  return (
    <form action={formAction} className="space-y-6">
      {state && !state.ok && <p role="alert" className="rounded-sm border border-[#8a2f22]/30 bg-[#8a2f22]/5 px-3 py-2 text-[0.75rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-sm border border-moss-700/25 bg-moss-50 px-3 py-2 text-[0.75rem] text-moss-800">{state.data.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="condominiumName" className={labelClass}>
            Condominium name
          </label>
          <input id="condominiumName" name="condominiumName" defaultValue={settings.condominiumName} className={inputClass} required />
        </div>
        <div>
          <label htmlFor="locationLabel" className={labelClass}>
            Location label
          </label>
          <input id="locationLabel" name="locationLabel" defaultValue={settings.locationLabel} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="tagline" className={labelClass}>
            Tagline
          </label>
          <input id="tagline" name="tagline" defaultValue={settings.tagline} className={inputClass} />
        </div>
        <div>
          <label htmlFor="contactEmail" className={labelClass}>
            Contact email
          </label>
          <input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} className={inputClass} required />
        </div>
        <div>
          <label htmlFor="contactPhone" className={labelClass}>
            Contact phone
          </label>
          <input id="contactPhone" name="contactPhone" defaultValue={settings.contactPhone} className={inputClass} />
        </div>
        <div>
          <label htmlFor="currency" className={labelClass}>
            Display currency
          </label>
          <select id="currency" name="currency" defaultValue={settings.currency} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="leadRetentionDays" className={labelClass}>
            Lead retention (days)
          </label>
          <input id="leadRetentionDays" name="leadRetentionDays" type="number" min={30} max={3650} defaultValue={settings.leadRetentionDays} className={inputClass} />
        </div>
        <div>
          <label htmlFor="visitSlotMinutes" className={labelClass}>
            Viewing slot (minutes)
          </label>
          <input id="visitSlotMinutes" name="visitSlotMinutes" type="number" min={15} max={180} step={15} defaultValue={settings.visitSlotMinutes} className={inputClass} />
        </div>
        <div>
          <label htmlFor="visitLeadTimeHours" className={labelClass}>
            Minimum notice (hours)
          </label>
          <input id="visitLeadTimeHours" name="visitLeadTimeHours" type="number" min={0} max={720} defaultValue={settings.visitLeadTimeHours} className={inputClass} />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-sm border border-ink-900/10 bg-white/60 px-3 py-2.5">
        <input type="checkbox" name="demoMode" defaultChecked={settings.demoMode} className="mt-0.5 h-4 w-4 accent-[#2f3a2f]" />
        <span>
          <span className="block text-[0.78rem] text-obsidian">Demonstration data</span>
          <span className="block text-[0.68rem] leading-relaxed text-ink-400">
            Keeps the public “demonstration” notices visible. Turn this off only when the content, imagery and plans have been replaced with verified material.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3 border-t border-ink-900/10 pt-5">
        <Save />
        <p className="text-[0.68rem] text-ink-400">Last scene publication: {settings.scenePublishedAt ? new Date(settings.scenePublishedAt).toLocaleString("en-GB") : "never"}</p>
      </div>
    </form>
  );
}
