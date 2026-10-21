"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { AdminState } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonProps } from "@/components/ui/button";

export type AdminActionFn = (prev: AdminState, formData: FormData) => Promise<AdminState>;

function Submit({ label, pendingLabel, variant, size, className }: { label: string; pendingLabel?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(buttonVariants({ variant: variant ?? "secondary", size: size ?? "sm" }), className)}>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {pending ? pendingLabel ?? "Working…" : label}
    </button>
  );
}

/**
 * A compact form for a single authorized mutation. Errors and confirmations are
 * rendered inline; every action re-validates permissions on the server.
 */
export function InlineAction({
  action,
  fields,
  label,
  pendingLabel,
  variant = "secondary",
  size = "sm",
  className,
  confirmMessage,
  icon,
  messageClassName,
}: {
  action: AdminActionFn;
  fields: Record<string, string | number | boolean | null | undefined>;
  label: string;
  pendingLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  confirmMessage?: string;
  icon?: React.ReactNode;
  messageClassName?: string;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(action, null);

  return (
    <form
      action={formAction}
      className={cn("inline-flex flex-col items-start gap-1", className)}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) =>
        value === null || value === undefined ? null : <input key={name} type="hidden" name={name} value={String(value)} />,
      )}
      <span className="inline-flex items-center gap-1.5">
        {icon}
        <Submit label={label} pendingLabel={pendingLabel} variant={variant} size={size} />
      </span>
      {state && !state.ok && (
        <span role="alert" className={cn("max-w-[16rem] text-[0.65rem] leading-snug text-[#8a2f22]", messageClassName)}>
          {state.error}
        </span>
      )}
      {state?.ok && (
        <span role="status" className={cn("max-w-[16rem] text-[0.65rem] leading-snug text-moss-700", messageClassName)}>
          {state.data.message}
        </span>
      )}
    </form>
  );
}
