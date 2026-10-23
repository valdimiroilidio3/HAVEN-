import type { Currency, PropertyStatus, Typology } from "./domain/types";

export function formatCurrency(cents: number | null | undefined, currency: Currency = "EUR"): string {
  if (cents === null || cents === undefined) return "Price on request";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

export function formatArea(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined) return "—";
  return `${formatNumber(m2)} m²`;
}

export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", opts ?? { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return "—";
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatPricePerM2(cents: number | null, usableArea: number, currency: Currency): string {
  if (!cents || usableArea <= 0) return "—";
  return `${formatCurrency(Math.round(cents / usableArea), currency)}/m²`;
}

export function currencyToCents(value: number): number {
  return Math.round(value * 100);
}

export function centsToCurrency(cents: number | null | undefined): number | "" {
  if (cents === null || cents === undefined) return "";
  return Math.round(cents) / 100;
}

export function statusTone(status: PropertyStatus): {
  label: string;
  dot: string;
  chip: string;
} {
  switch (status) {
    case "available":
      return { label: "Available", dot: "bg-moss-700", chip: "bg-moss-100 text-moss-700 border-moss-300/60" };
    case "reserved":
      return { label: "Reserved", dot: "bg-clay-700", chip: "bg-clay-100 text-clay-700 border-clay-300/60" };
    case "sold":
      return { label: "Sold", dot: "bg-ink-900", chip: "bg-ink-100 text-ink-700 border-ink-200" };
    case "hidden":
      return { label: "Hidden", dot: "bg-ink-400", chip: "bg-ink-50 text-ink-500 border-ink-200" };
    default:
      return { label: status, dot: "bg-ink-400", chip: "bg-ink-50 text-ink-500 border-ink-200" };
  }
}

/** Humanise an enum-ish value: "ready_to_move" -> "Ready to move". */
export function formatStatus(value: string | null | undefined): string {
  if (!value) return "—";
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function typologyHeadline(typology: Typology): string {
  return { T1: "One-bedroom", T2: "Two-bedroom", T3: "Three-bedroom", T4: "Four-bedroom" }[typology];
}

export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
