"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ArrowRight, Check, Loader2 } from "lucide-react";
import { submitEnquiry, submitVisitRequest, type PublicFormState } from "@/lib/actions/public";
import type { Typology } from "@/lib/domain/types";
import { TYPOLOGIES } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

interface PublicPropertyOption {
  id: string;
  code: string;
  title: string;
  typology: Typology;
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-obsidian px-5 text-sm font-medium text-porcelain transition hover:bg-ink-800 disabled:opacity-60 sm:w-auto"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : label}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1 text-xs text-[#8a2f22]" role="alert">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

export const inputClass =
  "h-11 w-full rounded-sm border border-ink-900/15 bg-white px-3 text-sm text-obsidian placeholder:text-ink-400 transition focus:border-ink-900/40 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-moss-700 aria-[invalid=true]:border-[#a34232]";

export const labelClass = "label-micro mb-2 block text-ink-500";

export function LeadForm({
  properties,
  defaultPropertyId,
  defaultTypology,
  tone = "light",
}: {
  properties: PublicPropertyOption[];
  defaultPropertyId?: string;
  defaultTypology?: Typology;
  tone?: "light" | "dark";
}) {
  const [state, action] = useActionState<PublicFormState, FormData>(submitEnquiry, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};

  if (state?.ok) {
    return (
      <div className="rounded-md border border-moss-300 bg-moss-100 p-6">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-moss-700">
          <Check className="h-4 w-4" aria-hidden />
        </span>
        <p className="display mt-4 text-2xl">Thank you.</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-600">
          Your enquiry has been recorded with reference <span className="font-mono text-xs">{state.data.id.slice(0, 8)}</span>. A member of
          the team will reply personally. This demonstration does not send automated email.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="source" value="website" />
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company-lead">Company</label>
        <input id="company-lead" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-name" className={labelClass}>Name</label>
          <input
            id="lead-name"
            name="name"
            required
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "lead-name-error" : undefined}
            className={inputClass}
          />
          <FieldError id="lead-name-error" message={errors.name?.[0]} />
        </div>
        <div>
          <label htmlFor="lead-email" className={labelClass}>Email</label>
          <input
            id="lead-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "lead-email-error" : undefined}
            className={inputClass}
          />
          <FieldError id="lead-email-error" message={errors.email?.[0]} />
        </div>
        <div>
          <label htmlFor="lead-phone" className={labelClass}>Phone (optional)</label>
          <input id="lead-phone" name="phone" type="tel" autoComplete="tel" className={inputClass} />
        </div>
        <div>
          <label htmlFor="lead-property" className={labelClass}>Property of interest</label>
          <select id="lead-property" name="propertyId" defaultValue={defaultPropertyId ?? ""} className={inputClass}>
            <option value="">Any residence</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.code} · {property.title} ({property.typology})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="lead-typology" className={labelClass}>Typology (optional)</label>
        <div className="flex flex-wrap gap-1.5">
          {TYPOLOGIES.map((typology) => (
            <label
              key={typology}
              className="cursor-pointer rounded-full border border-ink-900/15 bg-white px-3 py-1.5 text-xs has-[:checked]:border-obsidian has-[:checked]:bg-obsidian has-[:checked]:text-porcelain"
            >
              <input
                type="radio"
                name="typology"
                value={typology}
                defaultChecked={defaultTypology === typology}
                className="sr-only"
              />
              {typology}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="lead-message" className={labelClass}>Message</label>
        <textarea
          id="lead-message"
          name="message"
          rows={4}
          required
          minLength={10}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "lead-message-error" : undefined}
          className={cn(inputClass, "h-auto min-h-[110px] py-3")}
          placeholder="Tell us what you are looking for, and when you would like to visit."
        />
        <FieldError id="lead-message-error" message={errors.message?.[0]} />
      </div>
      <div>
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-600">
          <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px] border-ink-900/30 accent-[#171916]" />
          <span>
            I agree that HAVEN® may store these details to respond to my enquiry. Data is retained for a limited period and can be
            deleted on request.
          </span>
        </label>
        <FieldError id="lead-consent-error" message={errors.consent?.[0]} />
      </div>
      {state && !state.ok && <p className="rounded-sm border border-[#e2c3bc] bg-[#fbefec] px-3 py-2 text-xs text-[#7c2a1f]">{state.error}</p>}
      {tone === "dark" ? (
        <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-porcelain px-5 text-sm font-medium text-obsidian transition hover:bg-white sm:w-auto">
          Send enquiry <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <SubmitButton label="Send enquiry" pendingLabel="Sending" />
      )}
      <p className="text-[0.65rem] leading-relaxed text-ink-400">
        This form records your enquiry in the HAVEN® platform. No automated marketing email is sent from this demonstration.
      </p>
    </form>
  );
}

export function VisitForm({
  properties,
  defaultPropertyId,
  minDate,
  leadTimeHours,
}: {
  properties: PublicPropertyOption[];
  defaultPropertyId?: string;
  minDate: string;
  leadTimeHours: number;
}) {
  const [state, action] = useActionState<PublicFormState, FormData>(submitVisitRequest, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};

  if (state?.ok) {
    return (
      <div className="rounded-md border border-moss-300 bg-moss-100 p-6">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-moss-700">
          <Check className="h-4 w-4" aria-hidden />
        </span>
        <p className="display mt-4 text-2xl">Request recorded.</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-600">
          Reference <span className="font-mono text-xs">{state.data.id.slice(0, 8)}</span>. The team will confirm the visit
          personally by email or phone. No automated confirmation is sent until a provider is integrated.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="hidden" aria-hidden="true">
        <input name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="visit-property" className={labelClass}>Residence</label>
        <select
          id="visit-property"
          name="propertyId"
          required
          defaultValue={defaultPropertyId ?? properties[0]?.id ?? ""}
          className={inputClass}
          aria-invalid={Boolean(errors.propertyId)}
        >
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.code} · {property.title} ({property.typology})
            </option>
          ))}
        </select>
        <FieldError id="visit-property-error" message={errors.propertyId?.[0]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="visit-date" className={labelClass}>Preferred date</label>
          <input
            id="visit-date"
            name="preferredDate"
            type="date"
            required
            min={minDate}
            className={inputClass}
            aria-invalid={Boolean(errors.preferredDate)}
          />
          <FieldError id="visit-date-error" message={errors.preferredDate?.[0]} />
        </div>
        <div>
          <label htmlFor="visit-time" className={labelClass}>Preferred time</label>
          <input id="visit-time" name="preferredTime" type="time" required min="09:00" max="18:30" step={900} className={inputClass} />
          <FieldError id="visit-time-error" message={errors.preferredTime?.[0]} />
        </div>
        <div>
          <label htmlFor="visit-name" className={labelClass}>Name</label>
          <input id="visit-name" name="name" required autoComplete="name" className={inputClass} aria-invalid={Boolean(errors.name)} />
          <FieldError id="visit-name-error" message={errors.name?.[0]} />
        </div>
        <div>
          <label htmlFor="visit-email" className={labelClass}>Email</label>
          <input id="visit-email" name="email" type="email" required autoComplete="email" className={inputClass} aria-invalid={Boolean(errors.email)} />
          <FieldError id="visit-email-error" message={errors.email?.[0]} />
        </div>
      </div>
      <div>
        <label htmlFor="visit-phone" className={labelClass}>Phone (optional)</label>
        <input id="visit-phone" name="phone" type="tel" autoComplete="tel" className={inputClass} />
      </div>
      <div>
        <label htmlFor="visit-notes" className={labelClass}>Anything we should know?</label>
        <textarea id="visit-notes" name="notes" rows={3} className={cn(inputClass, "h-auto min-h-[88px] py-3")} />
      </div>
      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-600">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px] border-ink-900/30 accent-[#171916]" />
        <span>I agree that HAVEN® may contact me about this viewing and store my details for that purpose.</span>
      </label>
      <FieldError id="visit-consent-error" message={errors.consent?.[0]} />
      {state && !state.ok && <p className="rounded-sm border border-[#e2c3bc] bg-[#fbefec] px-3 py-2 text-xs text-[#7c2a1f]">{state.error}</p>}
      <SubmitButton label="Request a visit" pendingLabel="Sending request" />
      <p className="text-[0.65rem] leading-relaxed text-ink-400">
        Requests must be made at least {leadTimeHours} hours in advance. Visits are confirmed by the team, not automatically.
      </p>
    </form>
  );
}
