"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Property } from "@/lib/domain/types";

const InteriorExperience = dynamic(() => import("@/components/viewer/InteriorExperience").then((m) => m.InteriorExperience), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-porcelain">
      <p className="label-micro animate-pulse text-ink-400">Preparing interior…</p>
    </div>
  ),
});

export function InteriorLauncher({ property, isAdmin = false }: { property: Property; isAdmin?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-sm bg-obsidian px-5 text-sm font-medium text-porcelain transition hover:bg-ink-800"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        Explore the interior in 3D
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-porcelain"
            role="dialog"
            aria-modal="true"
            aria-label={`Interior of ${property.title}`}
          >
            <InteriorExperience property={property} isAdmin={isAdmin} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
