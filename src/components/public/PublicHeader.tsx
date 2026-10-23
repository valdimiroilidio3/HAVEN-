import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PublicHeader({ backHref = "/", backLabel = "Condominium", right }: { backHref?: string; backLabel?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-900/10 bg-porcelain/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-5">
          <Link href="/" className="display text-xl tracking-tightest">
            HAVEN<span className="align-super text-[0.55rem]">®</span>
          </Link>
          <span className="hidden h-4 w-px bg-ink-900/15 sm:block" />
          <Link href={backHref} className="hidden items-center gap-1.5 text-[0.72rem] text-ink-500 hover:text-obsidian sm:flex">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {backLabel}
          </Link>
        </div>
        <div className="flex items-center gap-3 text-[0.72rem]">
          {right ?? (
            <>
              <Link href="/properties" className="text-ink-500 hover:text-obsidian">Residences</Link>
              <Link href="/visit" className="inline-flex h-9 items-center rounded-full bg-obsidian px-4 font-medium text-porcelain">Book a visit</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
