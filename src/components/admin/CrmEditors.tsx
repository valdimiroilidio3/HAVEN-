"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { purgeLeadAction, updateLeadAction, updateVisitAction, type AdminState } from "@/lib/actions/admin";
import { LEAD_STATUSES, VISIT_STATUSES, LEAD_STATUS_LABELS, VISIT_STATUS_LABELS } from "@/lib/domain/constants";
import type { Lead, VisitRequest } from "@/lib/domain/types";
import { inputClass, labelClass } from "@/components/public/forms";

function Save({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-8 items-center gap-2 rounded-sm bg-obsidian px-3 text-[0.72rem] font-medium text-porcelain hover:bg-ink-800 disabled:opacity-50">
      {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {pending ? "Saving…" : label}
    </button>
  );
}

export function LeadEditor({ lead }: { lead: Lead }) {
  const [state, formAction] = useActionState<AdminState, FormData>(updateLeadAction, null);
  const [purgeState, purgeAction] = useActionState<AdminState, FormData>(purgeLeadAction, null);

  return (
    <div className="space-y-3 border-t border-ink-900/[0.07] bg-ink-50/40 px-5 py-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <input type="hidden" name="leadId" value={lead.id} />
        <div>
          <label htmlFor={`status-${lead.id}`} className={labelClass}>
            Status
          </label>
          <select id={`status-${lead.id}`} name="status" defaultValue={lead.status} className={inputClass}>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`notes-${lead.id}`} className={labelClass}>
            Internal note
          </label>
          <input id={`notes-${lead.id}`} name="notes" defaultValue={lead.notes ?? ""} className={inputClass} placeholder="Next step, budget, feedback…" />
        </div>
        <Save label="Update lead" />
      </form>
      {state && !state.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{state.data.message}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-900/[0.07] pt-2">
        <p className="text-[0.65rem] text-ink-400">
          Received {lead.consent ? "with" : "without"} marketing consent · retention until {lead.retentionUntil ? lead.retentionUntil.slice(0, 10) : "—"}
        </p>
        <form
          action={purgeAction}
          onSubmit={(event) => {
            if (!window.confirm("Permanently delete this lead and its message? This satisfies erasure requests and cannot be undone.")) event.preventDefault();
          }}
        >
          <input type="hidden" name="leadId" value={lead.id} />
          <button type="submit" className="inline-flex items-center gap-1.5 text-[0.65rem] text-[#8a2f22] hover:underline">
            <Trash2 className="h-3 w-3" aria-hidden /> Erase (GDPR)
          </button>
        </form>
      </div>
      {purgeState && !purgeState.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{purgeState.error}</p>}
    </div>
  );
}

export function VisitEditor({ visit }: { visit: VisitRequest }) {
  const [state, formAction] = useActionState<AdminState, FormData>(updateVisitAction, null);
  const when = new Date(visit.preferredAt);
  const dateValue = Number.isNaN(when.getTime()) ? "" : when.toISOString().slice(0, 10);
  const timeValue = Number.isNaN(when.getTime()) ? "" : when.toISOString().slice(11, 16);

  return (
    <div className="space-y-3 border-t border-ink-900/[0.07] bg-ink-50/40 px-5 py-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[150px_130px_110px_1fr_auto] sm:items-end">
        <input type="hidden" name="visitId" value={visit.id} />
        <div>
          <label htmlFor={`vstatus-${visit.id}`} className={labelClass}>
            Status
          </label>
          <select id={`vstatus-${visit.id}`} name="status" defaultValue={visit.status} className={inputClass}>
            {VISIT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VISIT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`vdate-${visit.id}`} className={labelClass}>
            Date
          </label>
          <input id={`vdate-${visit.id}`} name="preferredDate" type="date" defaultValue={dateValue} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`vtime-${visit.id}`} className={labelClass}>
            Time
          </label>
          <input id={`vtime-${visit.id}`} name="preferredTime" type="time" step={900} defaultValue={timeValue} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`vnotes-${visit.id}`} className={labelClass}>
            Admin note
          </label>
          <input id={`vnotes-${visit.id}`} name="adminNotes" defaultValue={visit.adminNotes ?? ""} className={inputClass} placeholder="Confirmed by phone, parking bay 4" />
        </div>
        <Save label="Update" />
      </form>
      {visit.notes && <p className="text-[0.68rem] italic text-ink-500">Visitor note: {visit.notes}</p>}
      {state && !state.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{state.data.message}</p>}
    </div>
  );
}
