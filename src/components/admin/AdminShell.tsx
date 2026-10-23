"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, CalendarDays, ChevronRight, Database, ExternalLink, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import type { SessionUser } from "@/lib/domain/types";
import { ROLE_LABELS } from "@/lib/domain/constants";
import { signOut } from "@/lib/actions/auth";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/properties", label: "Properties", icon: Building2 },
  { href: "/admin/3d-editor", label: "3D masterplan", icon: Sparkles },
  { href: "/admin/scene", label: "Scene health", icon: ShieldCheck },
  { href: "/admin/leads", label: "Leads", icon: Users },
  { href: "/admin/visits", label: "Viewings", icon: CalendarDays },
  { href: "/admin/media", label: "Media & assets", icon: Database },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({
  user,
  condominiumName,
  children,
}: {
  user: SessionUser;
  condominiumName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Administration">
      {NAV.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-sm px-3 py-2.5 text-[0.82rem] transition",
              active ? "bg-white/10 text-porcelain" : "text-porcelain/55 hover:bg-white/5 hover:text-porcelain",
            )}
          >
            <item.icon className={cn("h-4 w-4", active ? "text-clay-300" : "text-porcelain/35 group-hover:text-porcelain/70")} aria-hidden />
            <span className="flex-1">{item.label}</span>
            {active && <ChevronRight className="h-3.5 w-3.5 text-clay-300" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-white/10 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[0.7rem] font-medium text-porcelain">
          {initials(user.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.78rem] text-porcelain">{user.fullName}</p>
          <p className="truncate text-[0.65rem] text-porcelain/40">{ROLE_LABELS[user.role]} · {user.email}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[0.7rem] text-porcelain/45 hover:text-porcelain">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> View site
        </Link>
        <form action={signOut}>
          <button type="submit" className="inline-flex items-center gap-1.5 text-[0.7rem] text-porcelain/45 transition hover:text-porcelain">
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100svh] bg-[#f2f1ec]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-obsidian lg:flex">
        <div className="px-5 py-6">
          <Link href="/admin" className="display text-xl tracking-tightest text-porcelain">
            HAVEN<span className="align-super text-[0.55rem] text-clay-300">®</span>
          </Link>
          <p className="mt-2 truncate text-[0.6rem] uppercase tracking-[0.16em] text-porcelain/35">{condominiumName}</p>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-900/10 bg-porcelain/95 px-4 backdrop-blur lg:hidden">
        <Link href="/admin" className="display text-lg tracking-tightest">
          HAVEN<span className="align-super text-[0.5rem] text-clay-700">®</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] text-ink-400">{ROLE_LABELS[user.role]}</span>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-ink-900/15 bg-white text-ink-700"
            aria-label="Open administration menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-obsidian/50" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-obsidian"
            >
              <div className="flex items-center justify-between px-5 py-5">
                <span className="display text-xl text-porcelain">HAVEN<span className="align-super text-[0.5rem] text-clay-300">®</span></span>
                <button type="button" onClick={() => setMobileOpen(false)} className="text-porcelain/60 hover:text-porcelain" aria-label="Close menu">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              {nav}
              {footer}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:pl-[248px]">
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
