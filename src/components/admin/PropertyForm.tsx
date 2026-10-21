"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { createPropertyAction, updatePropertyAction, type AdminState } from "@/lib/actions/admin";
import { TYPOLOGIES, CURRENCIES, TYPOLOGY_CATALOGUE } from "@/lib/domain/constants";
import { typologyBedrooms } from "@/lib/domain/validation";
import type { Property } from "@/lib/domain/types";
import { inputClass, labelClass } from "@/components/public/forms";
import { cn } from "@/lib/utils";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-sm bg-obsidian px-5 text-[0.8rem] font-medium text-porcelain transition hover:bg-ink-800 disabled:opacity-50"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {pending ? "Saving…" : label}
    </button>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  name: string;
  error?: string[];
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[0.65rem] text-ink-400">{hint}</p>}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-[0.65rem] text-[#8a2f22]">
          {error[0]}
        </p>
      )}
    </div>
  );
}

export function PropertyForm({ property }: { property?: Property }) {
  const editing = Boolean(property);
  const action = editing ? updatePropertyAction : createPropertyAction;
  const [state, formAction] = useActionState<AdminState, FormData>(action, null);
  const [typology, setTypology] = React.useState(property?.typology ?? "T2");
  const [featuresText, setFeaturesText] = React.useState((property?.features ?? []).join("\n"));
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form action={formAction} className="space-y-7">
      {editing && <input type="hidden" name="propertyId" value={property!.id} />}

      {state && !state.ok && (
        <p role="alert" className="rounded-sm border border-[#8a2f22]/30 bg-[#8a2f22]/5 px-3 py-2 text-[0.75rem] text-[#8a2f22]">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-sm border border-moss-700/25 bg-moss-50 px-3 py-2 text-[0.75rem] text-moss-800">
          {state.data.message}
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="label-micro mb-3 text-ink-400">Identity</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code" name="code" error={errors.code} hint="H01, H02… must be unique">
            <input id="code" name="code" defaultValue={property?.code ?? ""} className={inputClass} placeholder="H14" required />
          </Field>
          <Field label="Title" name="title" error={errors.title} className="sm:col-span-2">
            <input id="title" name="title" defaultValue={property?.title ?? ""} className={inputClass} placeholder="Olive House" required />
          </Field>
          <Field label="Typology" name="typology" error={errors.typology}>
            <select
              id="typology"
              name="typology"
              value={typology}
              onChange={(event) => setTypology(event.target.value as typeof typology)}
              className={inputClass}
            >
              {TYPOLOGIES.map((t) => (
                <option key={t} value={t}>
                  {t} · {TYPOLOGY_CATALOGUE[t].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bedrooms" name="bedrooms" error={errors.bedrooms} hint={`${typology} requires ${typologyBedrooms[typology]}`}>
            <input
              id="bedrooms"
              name="bedrooms"
              type="number"
              min={0}
              max={10}
              defaultValue={property?.bedrooms ?? typologyBedrooms[typology]}
              key={`bed-${typology}`}
              className={inputClass}
            />
          </Field>
          <Field label="Bathrooms" name="bathrooms" error={errors.bathrooms}>
            <input id="bathrooms" name="bathrooms" type="number" min={1} max={10} defaultValue={property?.bathrooms ?? 2} className={inputClass} />
          </Field>
          <Field label="Parking spaces" name="parkingSpaces" error={errors.parkingSpaces}>
            <input id="parkingSpaces" name="parkingSpaces" type="number" min={0} max={10} defaultValue={property?.parkingSpaces ?? 1} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label-micro mb-3 text-ink-400">Areas & price</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Usable area (m²)" name="usableAreaM2" error={errors.usableAreaM2}>
            <input id="usableAreaM2" name="usableAreaM2" type="number" step="0.1" min="1" defaultValue={property?.usableAreaM2 ?? ""} className={inputClass} required />
          </Field>
          <Field label="Outdoor area (m²)" name="outdoorAreaM2" error={errors.outdoorAreaM2}>
            <input id="outdoorAreaM2" name="outdoorAreaM2" type="number" step="0.1" min="0" defaultValue={property?.outdoorAreaM2 ?? 0} className={inputClass} />
          </Field>
          <Field label="Plot area (m²)" name="plotAreaM2" error={errors.plotAreaM2} hint="Optional">
            <input id="plotAreaM2" name="plotAreaM2" type="number" step="0.1" min="0" defaultValue={property?.plotAreaM2 ?? ""} className={inputClass} />
          </Field>
          <div className="grid grid-cols-[1fr_92px] gap-2">
            <Field label="Price (EUR)" name="priceEuros" error={errors.priceEuros}>
              <input id="priceEuros" name="priceEuros" type="number" step="1000" min="0" defaultValue={property?.priceCents != null ? property.priceCents / 100 : ""} className={inputClass} />
            </Field>
            <Field label="Currency" name="currency" error={errors.currency}>
              <select id="currency" name="currency" defaultValue={property?.currency ?? "EUR"} className={inputClass}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label-micro mb-3 text-ink-400">Editorial</legend>
        <Field label="Description" name="description" error={errors.description} hint="Shown on the public property page.">
          <textarea id="description" name="description" rows={5} defaultValue={property?.description ?? ""} className={cn(inputClass, "h-auto py-2.5")} />
        </Field>
        <Field label="Features" name="features" error={errors.features} hint="One per line, maximum 24.">
          <textarea
            id="features"
            name="features"
            rows={4}
            value={featuresText}
            onChange={(event) => setFeaturesText(event.target.value)}
            className={cn(inputClass, "h-auto py-2.5 font-mono text-[0.75rem]")}
            placeholder={"Private garden\nUnderfloor heating\nSolar pre-installation"}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label-micro mb-3 text-ink-400">3D references</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Exterior model" name="exteriorModelRef" error={errors.exteriorModelRef} hint="procedural:exterior:T2@1 or asset:EXT-T2">
            <input id="exteriorModelRef" name="exteriorModelRef" defaultValue={property?.exteriorModelRef ?? ""} className={inputClass} />
          </Field>
          <Field label="Interior model" name="interiorModelRef" error={errors.interiorModelRef} hint="Leave empty to use the generated interior.">
            <input id="interiorModelRef" name="interiorModelRef" defaultValue={property?.interiorModelRef ?? ""} className={inputClass} />
          </Field>
          <Field label="Floor plan reference" name="floorPlanRef" error={errors.floorPlanRef}>
            <input id="floorPlanRef" name="floorPlanRef" defaultValue={property?.floorPlanRef ?? ""} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="label-micro mb-3 text-ink-400">Publication</legend>
        <Field label="Visibility" name="publication" error={errors.publication}>
          <select id="publication" name="publication" defaultValue={property?.publication === "archived" ? "draft" : property?.publication ?? "draft"} className={inputClass}>
            <option value="draft">Draft — internal only</option>
            <option value="published">Published — visible on the site</option>
          </select>
        </Field>
        <p className="self-end pb-2 text-[0.68rem] leading-relaxed text-ink-400">
          Publication never changes availability. A published home can be available, reserved or sold; archiving keeps its history.
        </p>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-ink-900/10 pt-5">
        <SubmitButton label={editing ? "Save property" : "Create property"} />
        <p className="text-[0.68rem] text-ink-400">
          {editing ? "Changes are written immediately and logged." : "New homes start hidden from the public site."}
        </p>
      </div>
    </form>
  );
}
