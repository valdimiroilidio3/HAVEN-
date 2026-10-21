"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { updateProfileAction, type AdminState } from "@/lib/actions/admin";
import { ROLE_LABELS } from "@/lib/domain/constants";
import type { Profile, Role } from "@/lib/domain/types";
import { inputClass } from "@/components/public/forms";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-8 items-center gap-2 rounded-sm border border-ink-900/15 bg-white px-3 text-[0.7rem] text-obsidian hover:border-ink-900/35 disabled:opacity-50">
      {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {pending ? "Saving…" : "Update"}
    </button>
  );
}

const ROLES: Role[] = ["admin", "manager", "viewer"];

export function TeamEditor({ profiles, currentUserId }: { profiles: Profile[]; currentUserId: string }) {
  const [state, formAction] = useActionState<AdminState, FormData>(updateProfileAction, null);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-ink-900/[0.07]">
        {profiles.map((profile) => (
          <li key={profile.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-[0.8rem] text-obsidian">
                {profile.fullName}
                {profile.id === currentUserId && <span className="ml-2 text-[0.62rem] uppercase tracking-[0.12em] text-clay-700">you</span>}
              </p>
              <p className="text-[0.66rem] text-ink-400">
                {profile.email} · joined {profile.createdAt.slice(0, 10)}
                {!profile.isActive && " · inactive"}
              </p>
            </div>
            <form action={formAction} className="flex items-end gap-2">
              <input type="hidden" name="profileId" value={profile.id} />
              <div>
                <label htmlFor={`role-${profile.id}`} className="sr-only">
                  Role for {profile.fullName}
                </label>
                <select id={`role-${profile.id}`} name="role" defaultValue={profile.role} className={`${inputClass} h-8 w-32 text-[0.72rem]`}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`active-${profile.id}`} className="sr-only">
                  Account state for {profile.fullName}
                </label>
                <select id={`active-${profile.id}`} name="active" defaultValue={String(profile.isActive)} className={`${inputClass} h-8 w-28 text-[0.72rem]`}>
                  <option value="true">Active</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <Save />
            </form>
          </li>
        ))}
      </ul>
      {state && !state.ok && <p role="alert" className="text-[0.7rem] text-[#8a2f22]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[0.7rem] text-moss-700">{state.data.message}</p>}
      <p className="text-[0.64rem] leading-relaxed text-ink-400">
        Roles: administrators manage everything including publishing; managers edit content and draft placements; viewers have read-only access.
      </p>
    </div>
  );
}
