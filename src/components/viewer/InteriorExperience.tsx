"use client";

import * as React from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Armchair, Bath, BedDouble, CookingPot, Maximize2, Moon, Refrigerator, RotateCw, Sofa, Square, Sun, Trees, Utensils, Waves } from "lucide-react";
import type { Property } from "@/lib/domain/types";
import { getFloorPlan } from "@/lib/domain/floorplans";
import { poolFor } from "@/lib/3d/site";
import { cn } from "@/lib/utils";
import { InteriorScene } from "@/components/three/InteriorScene";

class InteriorBoundary extends React.Component<{ children: React.ReactNode; onFail: () => void }, { failed: boolean }> {
  constructor(props: { children: React.ReactNode; onFail: () => void }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    console.warn("[HAVEN] interior scene error:", error.message);
    this.props.onFail();
  }
  override render() {
    if (this.state.failed) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-[#dfe2d5] px-6 text-center">
          <div>
            <p className="display text-2xl">Interior view unavailable</p>
            <p className="mt-2 max-w-sm text-sm text-ink-600">
              The 3D interior could not be rendered on this device. The floor plan and photography remain available.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ROOM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  living: Sofa,
  kitchen: CookingPot,
  bedroom: BedDouble,
  bathroom: Bath,
  study: Armchair,
  corridor: Square,
  hall: Square,
  terrace: Trees,
  dining: Utensils,
};

export interface InteriorExperienceProps {
  property: Property;
  isAdmin?: boolean;
  /** Inherit the day/night choice made on the masterplan. */
  timeOfDay?: "day" | "night";
  onTimeOfDayChange?: (value: "day" | "night") => void;
  onClose: () => void;
}

export function InteriorExperience({
  property,
  isAdmin = false,
  timeOfDay: initialTimeOfDay = "day",
  onTimeOfDayChange,
  onClose,
}: InteriorExperienceProps) {
  const plan = React.useMemo(() => getFloorPlan(property.typology), [property.typology]);
  const pool = React.useMemo(() => poolFor(property.code, property.typology), [property.code, property.typology]);
  const [walkMode, setWalkMode] = React.useState(false);
  const [focusRoomId, setFocusRoomId] = React.useState<string | null>(null);
  const [showFurniture, setShowFurniture] = React.useState(true);
  const [showAppliances, setShowAppliances] = React.useState(true);
  const [spin, setSpin] = React.useState(false);
  const [timeOfDay, setTimeOfDay] = React.useState<"day" | "night">(initialTimeOfDay);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [quality, setQuality] = React.useState<"low" | "high">("high");

  React.useEffect(() => {
    setQuality(window.innerWidth < 900 ? "low" : "high");
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  const mainRooms = React.useMemo(
    () => plan.rooms.filter((room) => ["living", "kitchen", "bedroom", "bathroom", "study"].includes(room.kind)),
    [plan.rooms],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#dfe2d5]">
      {!failed && (
        <InteriorBoundary onFail={() => setFailed(true)}>
          <Canvas
            shadows
            dpr={quality === "low" ? [1, 1.25] : [1, 1.8]}
            camera={{ fov: 42, near: 0.1, far: 400, position: [plan.widthM * 0.9, plan.widthM + 8, plan.depthM + 6] }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            onCreated={({ gl }) => {
              gl.setClearColor("#cfd6d2");
            }}
            className="absolute inset-0"
            aria-label={`Interactive 3D interior of ${property.title}`}
          >
            <React.Suspense fallback={null}>
              <InteriorScene
                typology={property.typology}
                focusRoomId={focusRoomId}
                walkMode={walkMode}
                showFurniture={showFurniture}
                showAppliances={showAppliances}
                spin={spin}
                timeOfDay={timeOfDay}
                pool={pool}
                quality={quality}
              />
            </React.Suspense>
          </Canvas>
        </InteriorBoundary>
      )}

      {!ready && !failed && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#dfe2d5]">
          <div className="h-10 w-10 animate-spin rounded-full border border-ink-900/20 border-t-ink-900" />
          <p className="label-micro text-ink-500">Building the interior</p>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
        <div className="pointer-events-auto flex items-start gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/60 bg-white/85 px-3 text-[0.72rem] font-medium text-ink-700 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Condominium
          </button>
          <div>
            <p className="label-micro text-ink-500">
              {property.code} · {property.typology} · Interior prototype
            </p>
            {pool && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-clay-500/50 bg-clay-500/15 px-2 py-0.5 text-[0.6rem] font-medium text-clay-700">
                <Waves className="h-3 w-3" aria-hidden /> Private pool
              </span>
            )}
            <p className="display mt-1 text-[1.55rem] leading-none text-obsidian">{property.title}</p>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-full border border-white/60 bg-white/85 p-1 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => setWalkMode(false)}
              className={cn("rounded-full px-3 py-1.5 text-[0.7rem] font-medium transition", !walkMode ? "bg-obsidian text-porcelain" : "text-ink-500 hover:text-obsidian")}
              aria-pressed={!walkMode}
            >
              Dollhouse
            </button>
            <button
              type="button"
              onClick={() => setWalkMode(true)}
              className={cn("rounded-full px-3 py-1.5 text-[0.7rem] font-medium transition", walkMode ? "bg-obsidian text-porcelain" : "text-ink-500 hover:text-obsidian")}
              aria-pressed={walkMode}
            >
              Room view
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSpin((v) => !v)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.7rem] font-medium shadow-sm backdrop-blur transition",
              spin ? "border-obsidian bg-obsidian text-porcelain" : "border-white/60 bg-white/85 text-ink-600 hover:bg-white",
            )}
            aria-pressed={spin}
          >
            <RotateCw className={cn("h-3.5 w-3.5", spin && "animate-spin [animation-duration:3s]")} aria-hidden /> 360°
          </button>
          <button
            type="button"
            onClick={() => {
              const next = timeOfDay === "day" ? "night" : "day";
              setTimeOfDay(next);
              onTimeOfDayChange?.(next);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/60 bg-white/85 px-3 text-[0.7rem] font-medium text-ink-600 shadow-sm backdrop-blur transition hover:bg-white"
            aria-pressed={timeOfDay === "night"}
            aria-label={timeOfDay === "day" ? "Switch to night lighting" : "Switch to daylight"}
          >
            {timeOfDay === "day" ? <Moon className="h-3.5 w-3.5" aria-hidden /> : <Sun className="h-3.5 w-3.5" aria-hidden />}
            {timeOfDay === "day" ? "Night" : "Day"}
          </button>
          <button
            type="button"
            onClick={() => setShowFurniture((v) => !v)}
            className="inline-flex h-8 items-center rounded-full border border-white/60 bg-white/85 px-3 text-[0.7rem] font-medium text-ink-600 shadow-sm backdrop-blur transition hover:bg-white"
            aria-pressed={!showFurniture}
          >
            {showFurniture ? "Hide furniture" : "Show furniture"}
          </button>
          {showFurniture && (
            <button
              type="button"
              onClick={() => setShowAppliances((v) => !v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.7rem] font-medium shadow-sm backdrop-blur transition",
                showAppliances ? "border-white/60 bg-white/85 text-ink-600 hover:bg-white" : "border-ink-900/20 bg-ink-900/10 text-ink-500",
              )}
              aria-pressed={showAppliances}
              title="Fridge, oven, hob, extractor, dishwasher, microwave, washer"
            >
              <Refrigerator className="h-3.5 w-3.5" aria-hidden />
              {showAppliances ? "Appliances on" : "Appliances off"}
            </button>
          )}
          {isAdmin && (
            <Link
              href={`/admin/properties/${property.id}`}
              className="inline-flex h-8 items-center rounded-full border border-white/60 bg-white/85 px-3 text-[0.7rem] font-medium text-ink-600 shadow-sm backdrop-blur transition hover:bg-white"
            >
              Edit property
            </Link>
          )}
        </div>
      </header>

      {/* Room navigation */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 p-4 sm:p-6">
        <div className="pointer-events-auto flex flex-col gap-3">
          <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setFocusRoomId(null)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[0.7rem] font-medium shadow-sm backdrop-blur transition",
                focusRoomId === null ? "border-obsidian bg-obsidian text-porcelain" : "border-white/60 bg-white/85 text-ink-600 hover:bg-white",
              )}
              aria-pressed={focusRoomId === null}
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Whole house
            </button>
            {mainRooms.map((room) => {
              const Icon = ROOM_ICONS[room.kind] ?? Square;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    setFocusRoomId(room.id);
                    if (!walkMode) setWalkMode(true);
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[0.7rem] font-medium shadow-sm backdrop-blur transition",
                    focusRoomId === room.id ? "border-obsidian bg-obsidian text-porcelain" : "border-white/60 bg-white/85 text-ink-600 hover:bg-white",
                  )}
                  aria-pressed={focusRoomId === room.id}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {room.name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-md text-[0.62rem] leading-relaxed text-ink-500">
              Prototype interior · ground floor only · generated from the plan, not an architectural model. Room view keeps the
              orbit inside the room; 360° keeps the camera circling so you can read the whole space. Appliances are
              indicative: fridge, induction hob, oven, extractor, dishwasher, microwave and washer where the plan allows.
            </p>
            <AnimatePresence>
              {walkMode && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-full bg-obsidian/80 px-3 py-1.5 text-[0.62rem] text-porcelain backdrop-blur"
                >
                  Drag to look around · scroll to move closer · 360° for a full turn
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
