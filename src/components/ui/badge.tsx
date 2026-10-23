import * as React from "react";
import { cn } from "@/lib/utils";
import type { PropertyStatus, PublicationStatus } from "@/lib/domain/types";
import { PROPERTY_STATUS_LABELS, PUBLICATION_LABELS } from "@/lib/domain/constants";

const statusStyles: Record<PropertyStatus, string> = {
  available: "bg-[#e8ece3] text-[#4f5b44] border-[#c4ccb9]",
  reserved: "bg-[#f2e9dc] text-[#7c6440] border-[#dfc9a9]",
  sold: "bg-ink-900 text-porcelain border-ink-900",
  hidden: "bg-ink-100 text-ink-500 border-ink-200",
};

export function StatusBadge({ status, className, dot = true }: { status: PropertyStatus; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.688rem] font-medium leading-none",
        statusStyles[status],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === "available" && "bg-[#6f7a62]",
            status === "reserved" && "bg-[#96784f]",
            status === "sold" && "bg-porcelain",
            status === "hidden" && "bg-ink-300",
          )}
        />
      )}
      {PROPERTY_STATUS_LABELS[status]}
    </span>
  );
}

export function PublicationBadge({ publication, className }: { publication: PublicationStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.688rem] font-medium leading-none",
        publication === "published" && "border-ink-900/15 bg-white text-ink-700",
        publication === "draft" && "border-dashed border-ink-900/25 bg-transparent text-ink-500",
        publication === "archived" && "border-ink-200 bg-ink-100 text-ink-400 line-through",
        className,
      )}
    >
      {PUBLICATION_LABELS[publication]}
    </span>
  );
}

export function Chip({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "sage" | "sand" | "dark" | "alert";
}) {
  const tones = {
    neutral: "border-ink-900/12 bg-white/70 text-ink-600",
    sage: "border-moss-300 bg-moss-100 text-moss-700",
    sand: "border-clay-300 bg-clay-100 text-clay-700",
    dark: "border-obsidian bg-obsidian text-porcelain",
    alert: "border-[#e2c3bc] bg-[#fbefec] text-[#8a2f22]",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.688rem] font-medium leading-none", tones[tone], className)}>
      {children}
    </span>
  );
}

export function TypologyMark({ typology, className }: { typology: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-[3px] border border-ink-900/15 bg-white px-1.5 font-mono text-[0.65rem] font-medium tracking-wider text-ink-700",
        className,
      )}
    >
      {typology}
    </span>
  );
}
