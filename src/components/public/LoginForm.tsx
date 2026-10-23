"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { signIn, type LoginState } from "@/lib/actions/auth";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-obsidian text-sm font-medium text-porcelain transition hover:bg-ink-800 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
      {pending ? "Signing in…" : "Sign in"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export function LoginForm({ next, demoEmail, demoPassword }: { next: string; demoEmail: string; demoPassword: string }) {
  const [state, action] = useActionState<LoginState, FormData>(signIn, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label-micro mb-2 block text-ink-500">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={demoEmail}
          className="h-11 w-full rounded-sm border border-ink-900/15 bg-white px-3 text-sm focus:border-ink-900/40 focus:outline-none focus-visible:outline-2 focus-visible:outline-moss-700"
        />
      </div>
      <div>
        <label htmlFor="password" className="label-micro mb-2 block text-ink-500">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="h-11 w-full rounded-sm border border-ink-900/15 bg-white px-3 text-sm focus:border-ink-900/40 focus:outline-none focus-visible:outline-2 focus-visible:outline-moss-700"
        />
      </div>
      {state && !state.ok && <p className="rounded-sm border border-[#e2c3bc] bg-[#fbefec] px-3 py-2 text-xs text-[#7c2a1f]" role="alert">{state.error}</p>}
      <Submit />
      <p className="rounded-sm border border-dashed border-ink-900/15 bg-white/50 px-3 py-2 text-[0.68rem] leading-relaxed text-ink-500">
        Demo administrator: <span className="font-mono">{demoEmail}</span> / <span className="font-mono">{demoPassword}</span>. Seeded
        accounts exist only when the local database is initialised. Change them before any real deployment.
      </p>
    </form>
  );
}
