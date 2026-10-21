import Link from "next/link";
import type { AppSettings } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";

export function SiteFooter({ settings, isAdmin }: { settings: AppSettings; isAdmin: boolean }) {
  return (
    <footer className="border-t border-ink-900/10 bg-obsidian text-porcelain">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:px-10 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="display text-4xl tracking-tightest">
            HAVEN<span className="align-super text-xs">®</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-porcelain/60">{settings.tagline}</p>
          <p className="mt-6 label-micro text-porcelain/35">{settings.locationLabel} · Demonstration development</p>
        </div>
        <div>
          <p className="label-micro text-porcelain/35">Explore</p>
          <ul className="mt-4 space-y-2 text-sm text-porcelain/75">
            <li><Link href="/#condominium" className="hover:text-white">The condominium</Link></li>
            <li><Link href="/#typologies" className="hover:text-white">Typologies</Link></li>
            <li><Link href="/properties" className="hover:text-white">Availability</Link></li>
            <li><Link href="/visit" className="hover:text-white">Book a visit</Link></li>
          </ul>
        </div>
        <div>
          <p className="label-micro text-porcelain/35">Contact</p>
          <ul className="mt-4 space-y-2 text-sm text-porcelain/75">
            <li>{settings.contactEmail}</li>
            <li>{settings.contactPhone}</li>
            <li>
              <Link href={isAdmin ? "/admin" : "/login"} className="underline underline-offset-4 hover:text-white">
                {isAdmin ? "Administration" : "Team sign-in"}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-6 py-6 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 text-[0.65rem] leading-relaxed text-porcelain/40 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} HAVEN®. Demonstration project. Areas, prices and specifications are prototypes pending
            architectural and commercial validation.
          </p>
          <p className="whitespace-nowrap">Scene published {settings.scenePublishedAt ? formatDateTime(settings.scenePublishedAt) : "—"}</p>
        </div>
      </div>
    </footer>
  );
}
