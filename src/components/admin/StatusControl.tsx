"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { changeStatusAction, publicationAction, type AdminState } from "@/lib/actions/admin";
import { PROPERTY_STATUSES, PROPERTY_STATUS_LABELS } from "@/lib/domain/constants";
import type { Property, PublicationStatus } from "@/lib/domain/types";
import { inputClass, labelClass } from "@/components/public/forms";
import { cn } from "@/lib/utils";

function Submit({ label, tone = "primary" }: { label: string; tone?: "primary" | "quiet" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-sm px-4 text-xs font-medium transition disabled:opacity-50",
        tone === "primary" ? "bg-obsidian text-porcelain hover:bg-ink-800" : "border border-ink-900/15 bg-white text-obsidian hover:border-ink-900/35",
      )}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {pending ? "Saving…" : label}
    </button>
  );
}

export function StatusControl({ property }: { property: Property }) {
  const [state, formAction] = useActionState<AdminState, FormData>(changeStatusAction, null);
  const [status, setStatus] = React.useState(property.status);
  const [reservedUntil, setReservedUntil] = React.useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="propertyId" value={property.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className={labelClass}>
            Availability
          </label>
          <select id="status" name="status" value={status} onChange={(event) => setStatus(event.target.value as Property["status"])} className={inputClass}>
            {PROPERTY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PROPERTY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        {status === "reserved" ? (
          <div>
            <label htmlFor="reservedUntil" className={labelClass}>
              Reserved until
            </label>
            <input
              id="reservedUntil"
              name="reservedUntil"
              type="date"
              value={reservedUntil}
              onChange={(event) => setReservedUntil(event.target.value)}
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="reason" className={labelClass}>
              Note (optional)
            </label>
            <input id="reason" name="reason" className={inputClass} placeholder="Why is this changing?" />
          </div>
        )}
      </div>
      {status === "reserved" && (
        <p className="text-[0.68rem] leading-relaxed text-ink-400">
          Reserving creates an active reservation record. Moving to available or sold releases it automatically.
        </p>
      )}
      {state && !state.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{state.data.message}</p>}
      <Submit label="Update availability" />
    </form>
  );
}

export function PublicationControl({ property }: { property: Property }) {
  const [state, formAction] = useActionState<AdminState, FormData>(publicationAction, null);
  const current = property.publication;
  const options: Array<{ value: PublicationStatus; label: string; description: string }> = [
    { value: "draft", label: "Draft", description: "Internal only" },
    { value: "published", label: "Published", description: "Visible on the site" },
    { value: "archived", label: "Archived", description: "Retired, history kept" },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((option) => {
          const disabled = option.value === current;
          return (
            <form
              key={option.value}
              action={formAction}
              onSubmit={(event) => {
                if (option.value === "archived" && !window.confirm(`Archive ${property.code}? It will disappear from the public site and can be restored later.`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="propertyId" value={property.id} />
              <input type="hidden" name="publication" value={option.value} />
              <button
                type="submit"
                disabled={disabled}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm border px-3 py-2 text-left text-[0.75rem] transition",
                  disabled ? "cursor-default border-ink-900 bg-ink-50 text-ink-500" : "border-ink-900/15 bg-white hover:border-ink-900/35",
                  option.value === "archived" && !disabled && "text-[#8a2f22]",
                )}
              >
                <span>{option.label}</span>
                <span className="text-[0.65rem] text-ink-400">{disabled ? "current" : option.description}</span>
              </button>
            </form>
          );
        })}
      </div>
      {state && !state.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{state.data.message}</p>}
    </div>
  );
}
