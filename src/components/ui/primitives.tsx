import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-ink-900/10 bg-[#fbfbf8] shadow-[0_1px_0_rgba(23,25,22,0.03)]", className)} {...props} />;
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("label-micro text-ink-400", className)}>{children}</p>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "sage" | "sand" | "dark";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border p-5",
        tone === "sage" && "border-moss-300/70 bg-moss-100",
        tone === "sand" && "border-clay-300/70 bg-clay-100",
        tone === "dark" && "border-obsidian bg-obsidian text-porcelain",
        (!tone || tone === "default") && "border-ink-900/10 bg-[#fbfbf8]",
        className,
      )}
    >
      <p className={cn("label-micro", tone === "dark" ? "text-porcelain/50" : "text-ink-400")}>{label}</p>
      <p className="mt-4 font-display text-[2.6rem] leading-none tracking-tightest tabular">{value}</p>
      {hint && <p className={cn("mt-2 text-xs", tone === "dark" ? "text-porcelain/60" : "text-ink-400")}>{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-md border border-dashed border-ink-900/15 bg-white/40 px-6 py-16 text-center", className)}>
      {icon && <div className="mb-4 text-ink-300">{icon}</div>}
      <p className="font-display text-2xl text-obsidian">{title}</p>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "error" | "warning";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-ink-900/12 bg-white/70 text-ink-600",
    success: "border-moss-300 bg-moss-100 text-[#42503a]",
    error: "border-[#e2c3bc] bg-[#fbefec] text-[#7c2a1f]",
    warning: "border-clay-300 bg-clay-100 text-[#6f5733]",
  } as const;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-sm border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}
    >
      {title && <p className="mb-1 font-medium">{title}</p>}
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-sm", className)} aria-hidden />;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-ink-900/10", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-ink-900/20 bg-white px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-500">
      {children}
    </kbd>
  );
}
