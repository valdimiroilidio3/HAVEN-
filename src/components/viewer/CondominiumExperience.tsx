"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Activity, ArrowRight, Boxes, CalendarDays, CarFront, Info, Layers, Maximize2, Moon, RotateCcw, RotateCw, Sparkles, Sun, Trophy, Waves, X } from "lucide-react";
import type { AppSettings, Property, PropertyMedia, PropertyPosition, PropertyStatus, Typology } from "@/lib/domain/types";
import { PROPERTY_STATUS_LABELS, TYPOLOGIES, TYPOLOGY_CATALOGUE } from "@/lib/domain/constants";
import { formatArea, formatCurrency, typologyHeadline } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SiteScene } from "@/components/three/SiteScene";
import { TelemetrySampler } from "@/components/three/TelemetrySampler";
import { PerformancePanel } from "@/components/viewer/PerformancePanel";
import { FloorPlan2D, PlanLegend } from "@/components/plan/FloorPlan2D";
import { poolFor } from "@/lib/3d/site";

const InteriorExperience = dynamic(() => import("@/components/viewer/InteriorExperience").then((m) => m.InteriorExperience), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-porcelain">
      <p className="label-micro animate-pulse text-ink-400">Preparing interior…</p>
    </div>
  ),
});

export interface ExperienceEntry {
  property: Property;
  position: PropertyPosition;
  media: PropertyMedia[];
}

export interface CondominiumExperienceProps {
  entries: ExperienceEntry[];
  settings: AppSettings;
  isAdmin?: boolean;
  className?: string;
}

class CanvasBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    console.warn("[HAVEN] 3D scene error:", error.message);
  }
  override render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Camera behaviour for the masterplan.
 *
 * Selecting a house flies the camera in and then performs one full 360° orbit so
 * the unit is understood in the round rather than from a single angle. Any drag
 * hands control back to the visitor immediately; the "360°" control replays it.
 */
function CameraRig({
  focus,
  mode,
  resetToken,
  orbitToken,
}: {
  focus: { x: number; z: number; size: number } | null;
  mode: "site" | "plan";
  resetToken: number;
  orbitToken: number;
}) {
  const { camera } = useThree();
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as (THREE.EventDispatcher & {
    target: THREE.Vector3;
    update: () => void;
    enabled: boolean;
  }) | null;
  // Overview framing for the full site: west sports park to east row, gate in front.
  const destination = React.useRef(new THREE.Vector3(96, 74, 132));
  const lookAt = React.useRef(new THREE.Vector3(-13, 2, 7));
  const animating = React.useRef(false);
  const orbit = React.useRef<{
    center: THREE.Vector3;
    radius: number;
    height: number;
    startRadius: number;
    startHeight: number;
    startAngle: number;
    startedAt: number;
    duration: number;
  } | null>(null);

  const stopOrbit = React.useCallback(() => {
    orbit.current = null;
    if (controls) controls.enabled = true;
  }, [controls]);

  React.useEffect(() => {
    if (mode === "plan") {
      orbit.current = null;
      if (controls) controls.enabled = true;
      const centerX = focus?.x ?? -13;
      const centerZ = focus?.z ?? 7;
      lookAt.current.set(centerX, 0, centerZ);
      destination.current.set(centerX, focus ? 96 : 132, centerZ + 0.01);
    } else if (focus) {
      const size = focus.size;
      const distance = 13 + size * 5.2;
      const height = 6 + size * 2.1;
      const dirX = focus.x === 0 && focus.z === 0 ? 0.35 : focus.x;
      const dirZ = focus.z === 0 ? 1 : focus.z;
      const length = Math.hypot(dirX, dirZ) || 1;
      lookAt.current.set(focus.x, 2.2, focus.z);
      destination.current.set(
        focus.x + (dirX / length) * distance * 0.75 + 2.4,
        height,
        focus.z + (dirZ / length) * distance * 0.75 + 2.4,
      );
      const center = new THREE.Vector3(focus.x, 2.2, focus.z);
      orbit.current = {
        center,
        radius: Math.max(9, distance),
        height: Math.max(5.5, height * 0.82),
        startRadius: Math.max(4, camera.position.distanceTo(center)),
        startHeight: camera.position.y,
        startAngle: Math.atan2(camera.position.z - focus.z, camera.position.x - focus.x),
        startedAt: performance.now(),
        duration: 9000,
      };
      if (controls) controls.enabled = false;
    } else {
      orbit.current = null;
      if (controls) controls.enabled = true;
      lookAt.current.set(-13, 2, 7);
      destination.current.set(96, 74, 132);
    }
    animating.current = true;
  }, [focus, mode, resetToken, orbitToken, camera, controls]);

  React.useEffect(() => {
    if (!controls) return;
    if (mode === "plan") {
      controls.target.set(focus?.x ?? 0, 0, focus?.z ?? 4);
    }
  }, [controls, mode, focus]);

  // A deliberate drag cancels the tour; the visitor is always in charge.
  React.useEffect(() => {
    const element = gl.domElement;
    const cancel = () => stopOrbit();
    element.addEventListener("pointerdown", cancel);
    element.addEventListener("wheel", cancel, { passive: true });
    return () => {
      element.removeEventListener("pointerdown", cancel);
      element.removeEventListener("wheel", cancel);
    };
  }, [gl, stopOrbit]);

  useFrame((_, delta) => {
    if (orbit.current) {
      const tour = orbit.current;
      const progress = Math.min(1, (performance.now() - tour.startedAt) / tour.duration);
      const eased = progress * progress * (3 - 2 * progress);
      // Ease the radius/height in during the first third so the tour starts from
      // wherever the visitor was standing instead of snapping to the circle.
      const approach = Math.min(1, progress / 0.32);
      const approachEased = approach * approach * (3 - 2 * approach);
      const radius = tour.startRadius + (tour.radius - tour.startRadius) * approachEased;
      const height = tour.startHeight + (tour.height - tour.startHeight) * approachEased;
      const angle = tour.startAngle + eased * Math.PI * 2;
      camera.position.set(
        tour.center.x + Math.cos(angle) * radius,
        height + Math.sin(progress * Math.PI) * radius * 0.16,
        tour.center.z + Math.sin(angle) * radius,
      );
      camera.lookAt(tour.center);
      if (controls) {
        controls.target.copy(tour.center);
      }
      if (progress >= 1) stopOrbit();
      return;
    }
    if (!animating.current) return;
    const alpha = 1 - Math.exp(-4.5 * Math.min(delta, 0.1));
    camera.position.lerp(destination.current, alpha);
    if (controls) {
      controls.target.lerp(lookAt.current, alpha);
      controls.update();
    }
    if (camera.position.distanceTo(destination.current) < 0.2) animating.current = false;
  });

  React.useEffect(() => () => stopOrbit(), [stopOrbit]);

  return null;
}

function SceneLoader({ onReady }: { onReady: () => void }) {
  React.useEffect(() => {
    const timer = window.setTimeout(onReady, 700);
    return () => window.clearTimeout(timer);
  }, [onReady]);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#dfe2d5]">
      <div className="h-10 w-10 animate-spin rounded-full border border-ink-900/20 border-t-ink-900" />
      <p className="label-micro text-ink-500">Preparing the condominium</p>
    </div>
  );
}

function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      setSupported(Boolean(gl));
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}

function useLowQuality(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [low, setLow] = React.useState(false);
  React.useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const constrained =
      window.innerWidth < 900 ||
      (nav.hardwareConcurrency ?? 8) <= 4 ||
      (nav.deviceMemory ?? 8) <= 4 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLow(constrained);
  }, []);
  return [low, setLow];
}

const STATUS_FILTERS: Array<{ value: "all" | PropertyStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "available", label: PROPERTY_STATUS_LABELS.available },
  { value: "reserved", label: PROPERTY_STATUS_LABELS.reserved },
  { value: "sold", label: PROPERTY_STATUS_LABELS.sold },
];

export function CondominiumExperience({ entries, settings, isAdmin = false, className }: CondominiumExperienceProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [activeTypologies, setActiveTypologies] = React.useState<Set<Typology>>(new Set(TYPOLOGIES));
  const [statusFilter, setStatusFilter] = React.useState<"all" | PropertyStatus>("all");
  const [mode, setMode] = React.useState<"site" | "plan">("site");
  const [resetToken, setResetToken] = React.useState(0);
  const [orbitToken, setOrbitToken] = React.useState(0);
  const [timeOfDay, setTimeOfDay] = React.useState<"day" | "night">("day");
  const [ready, setReady] = React.useState(false);
  const [interiorOpen, setInteriorOpen] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [showPerf, setShowPerf] = React.useState(false);
  const [panelTab, setPanelTab] = React.useState<"overview" | "plan" | "gallery">("overview");
  const webgl = useWebGLSupport();
  const [lowQuality, setLowQuality] = useLowQuality();

  const selectedEntry = entries.find((entry) => entry.property.id === selectedId) ?? null;
  const selected = React.useMemo(
    () => (selectedEntry ? { ...selectedEntry.property, media: selectedEntry.media } : null),
    [selectedEntry],
  );

  const visibleIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      const { property } = entry;
      const typologyOk = activeTypologies.has(property.typology);
      const statusOk = statusFilter === "all" || property.status === statusFilter;
      if (typologyOk && statusOk) set.add(property.id);
    }
    return set;
  }, [entries, activeTypologies, statusFilter]);

  const counts = React.useMemo(() => {
    const result = Object.fromEntries(TYPOLOGIES.map((t) => [t, 0])) as Record<Typology, number>;
    for (const entry of entries) result[entry.property.typology] += 1;
    return result;
  }, [entries]);

  const focus = React.useMemo(() => {
    if (!selectedEntry) return null;
    const size = selectedEntry.property.typology === "T4" ? 2 : selectedEntry.property.typology === "T3" ? 1.6 : 1.2;
    return { x: selectedEntry.position.publishedX, z: selectedEntry.position.publishedZ, size };
  }, [selectedEntry, mode]);

  const selectedPool = React.useMemo(
    () => (selected ? poolFor(selected.code, selected.typology) : null),
    [selected],
  );

  const handleSelect = React.useCallback((id: string) => {
    setSelectedId(id);
    setMode("site");
    setPanelTab("overview");
    setOrbitToken((token) => token + 1);
  }, []);

  const handleReset = React.useCallback(() => {
    setSelectedId(null);
    setMode("site");
    setResetToken((t) => t + 1);
  }, []);

  const replayOrbit = React.useCallback(() => {
    setMode("site");
    setOrbitToken((token) => token + 1);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (interiorOpen) setInteriorOpen(false);
        else if (selectedId) setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, interiorOpen]);

  const toggleTypology = (typology: Typology) => {
    setActiveTypologies((current) => {
      const next = new Set(current);
      if (next.has(typology)) next.delete(typology);
      else next.add(typology);
      return next.size === 0 ? new Set(TYPOLOGIES) : next;
    });
  };

  return (
    <div className={cn("relative isolate h-[100svh] min-h-[620px] w-full overflow-hidden bg-[#dfe2d5]", className)}>
      {/* 3D canvas */}
      {webgl === true && (
        <CanvasBoundary fallback={<FallbackScene entries={entries} onSelect={handleSelect} />}>
          <Canvas
            shadows
            dpr={lowQuality ? [1, 1.25] : [1, 1.75]}
            camera={{ fov: 36, near: 0.5, far: 22000, position: [62, 52, 88] }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.02;
            }}
            onPointerMissed={() => setSelectedId(null)}
            className="absolute inset-0"
            aria-label="Interactive 3D condominium with thirteen houses"
          >
            <React.Suspense fallback={null}>
              <SiteScene
                entries={entries.map((entry) => ({
                  property: entry.property,
                  position: { x: entry.position.publishedX, z: entry.position.publishedZ },
                  rotationY: entry.position.publishedRotationY,
                }))}
                selectedId={selectedId}
                hoveredId={hoveredId}
                visibleIds={visibleIds}
                lowQuality={lowQuality}
                timeOfDay={timeOfDay}
                onSelect={handleSelect}
                onHover={setHoveredId}
              />
            </React.Suspense>
            {showPerf && <TelemetrySampler />}
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.055}
              minDistance={mode === "plan" ? 30 : 10}
              maxDistance={mode === "plan" ? 200 : 260}
              maxPolarAngle={mode === "plan" ? 0.06 : Math.PI * 0.47}
              minPolarAngle={0.12}
              enableRotate={mode === "site"}
              target={[-13, 2, 7]}
              zoomSpeed={0.8}
              panSpeed={0.7}
            />
            <CameraRig focus={focus} mode={mode} resetToken={resetToken} orbitToken={orbitToken} />
          </Canvas>
        </CanvasBoundary>
      )}
      {webgl === false && <FallbackScene entries={entries} onSelect={handleSelect} />}
      {!ready && webgl !== false && <SceneLoader onReady={() => setReady(true)} />}

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="pointer-events-auto">
          <Link href="/" className="group flex items-baseline gap-2" aria-label="HAVEN home">
            <span className="display text-[1.65rem] tracking-tightest text-obsidian">HAVEN</span>
            <span className="text-[0.6rem] align-super text-ink-500">®</span>
          </Link>
          <p className="mt-1 max-w-[15rem] text-[0.7rem] leading-relaxed text-ink-600">{settings.tagline}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-[0.68rem] text-ink-600 backdrop-blur sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-moss-700" />
            {entries.length} residences · 4 typologies
          </div>
          <Link
            href="/visit"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-obsidian px-4 text-[0.78rem] font-medium text-porcelain transition hover:bg-ink-800"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Book a visit
          </Link>
          <button
            type="button"
            onClick={() => setTimeOfDay((value) => (value === "day" ? "night" : "day"))}
            aria-pressed={timeOfDay === "night"}
            aria-label={timeOfDay === "day" ? "Switch the masterplan to night" : "Switch the masterplan to daylight"}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 text-[0.72rem] font-medium text-ink-700 backdrop-blur transition hover:bg-white"
          >
            {timeOfDay === "day" ? <Moon className="h-3.5 w-3.5" aria-hidden /> : <Sun className="h-3.5 w-3.5" aria-hidden />}
            <span className="hidden sm:inline">{timeOfDay === "day" ? "Night" : "Day"}</span>
          </button>
          <Link
            href={isAdmin ? "/admin" : "/login"}
            className="hidden h-9 items-center rounded-full border border-white/60 bg-white/70 px-4 text-[0.78rem] font-medium text-ink-700 backdrop-blur transition hover:bg-white sm:inline-flex"
          >
            {isAdmin ? "Admin" : "Sign in"}
          </Link>
        </div>
      </header>

      {/* Left: filters + controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3.5 py-2 text-[0.72rem] font-medium text-ink-700 shadow-sm backdrop-blur transition hover:bg-white"
              aria-expanded={showFilters}
              aria-controls="viewer-filters"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden />
              Filter residences
              <span className="rounded-full bg-ink-900/8 px-1.5 py-0.5 text-[0.62rem] tabular text-ink-500">
                {visibleIds.size}/{entries.length}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {showFilters && (
                <motion.div
                  id="viewer-filters"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="w-[min(88vw,21rem)] rounded-md border border-white/70 bg-porcelain/95 p-4 shadow-lift backdrop-blur"
                >
                  <p className="label-micro text-ink-400">Typology</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TYPOLOGIES.map((typology) => {
                      const active = activeTypologies.has(typology);
                      return (
                        <button
                          key={typology}
                          type="button"
                          onClick={() => toggleTypology(typology)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-[0.7rem] font-medium transition",
                            active ? "border-obsidian bg-obsidian text-porcelain" : "border-ink-900/15 bg-white text-ink-500 hover:border-ink-900/35",
                          )}
                        >
                          {typology}
                          <span className="ml-1.5 tabular opacity-60">{counts[typology]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="label-micro mt-4 text-ink-400">Commercial status</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((status) => (
                      <button
                        key={status.value}
                        type="button"
                        onClick={() => setStatusFilter(status.value)}
                        aria-pressed={statusFilter === status.value}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[0.7rem] font-medium transition",
                          statusFilter === status.value
                            ? "border-obsidian bg-obsidian text-porcelain"
                            : "border-ink-900/15 bg-white text-ink-500 hover:border-ink-900/35",
                        )}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTypologies(new Set(TYPOLOGIES));
                      setStatusFilter("all");
                    }}
                    className="mt-4 text-[0.7rem] text-ink-500 underline underline-offset-4 hover:text-obsidian"
                  >
                    Reset filters
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="hidden rounded-full border border-white/60 bg-white/80 p-1 shadow-sm backdrop-blur sm:flex">
              <button
                type="button"
                onClick={() => setMode("site")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[0.7rem] font-medium transition",
                  mode === "site" ? "bg-obsidian text-porcelain" : "text-ink-500 hover:text-obsidian",
                )}
                aria-pressed={mode === "site"}
              >
                <Boxes className="mr-1 inline h-3.5 w-3.5" aria-hidden /> 3D
              </button>
              <button
                type="button"
                onClick={() => setMode("plan")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[0.7rem] font-medium transition",
                  mode === "plan" ? "bg-obsidian text-porcelain" : "text-ink-500 hover:text-obsidian",
                )}
                aria-pressed={mode === "plan"}
              >
                <Maximize2 className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Plan
              </button>
            </div>
            <button
              type="button"
              onClick={replayOrbit}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3 text-[0.7rem] font-medium text-ink-600 shadow-sm backdrop-blur transition hover:bg-white"
              title="Orbit the selected residence through a full turn"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">360°</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3 text-[0.7rem] font-medium text-ink-600 shadow-sm backdrop-blur transition hover:bg-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Reset view</span>
            </button>
            <button
              type="button"
              onClick={() => setLowQuality((v) => !v)}
              className="hidden h-9 items-center rounded-full border border-white/60 bg-white/80 px-3 text-[0.7rem] font-medium text-ink-600 shadow-sm backdrop-blur transition hover:bg-white md:inline-flex"
              aria-pressed={lowQuality}
            >
              {lowQuality ? "Performance" : "Quality"}
            </button>
            <button
              type="button"
              onClick={() => setShowPerf((value) => !value)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3 text-[0.7rem] font-medium text-ink-600 shadow-sm backdrop-blur transition hover:bg-white"
              aria-pressed={showPerf}
              title="Show the renderer's own frame statistics"
            >
              <Activity className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Perf</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[0.62rem] text-ink-500">
          <p className="max-w-md leading-relaxed">
            Demonstration data · Prototype 3D · Click a house for a 360° walk-around · the sports park sits west, the lagoon in the centre · drag to orbit, scroll to zoom.
          </p>
          <p className="hidden shrink-0 items-center gap-1.5 sm:flex">
            <Info className="h-3 w-3" aria-hidden />
            Scene published {settings.scenePublishedAt ? new Date(settings.scenePublishedAt).toLocaleDateString("en-GB") : "—"}
          </p>
        </div>
      </div>

      <PerformancePanel open={showPerf} onClose={() => setShowPerf(false)} lowQuality={lowQuality} timeOfDay={timeOfDay} />

      {/* Keyboard / screen-reader selection list */}
      <div className="sr-only">
        <h2>Residences</h2>
        <ul>
          {entries.map((entry) => (
            <li key={entry.property.id}>
              <button type="button" onClick={() => handleSelect(entry.property.id)}>
                {entry.property.code} {entry.property.title}, {entry.property.typology}, {formatCurrency(entry.property.priceCents, entry.property.currency)}, {entry.property.status}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Selection panel */}
      <AnimatePresence>
        {selected && (
          <motion.aside
            key={selected.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 z-40 flex max-h-[74svh] flex-col overflow-hidden rounded-t-xl border border-ink-900/10 bg-porcelain shadow-lift sm:inset-y-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-[24rem] sm:rounded-lg"
            role="dialog"
            aria-label={`${selected.title} details`}
          >
            <div className="relative h-40 shrink-0 overflow-hidden sm:h-48">
              <Image
                src={selected.media.find((m) => m.kind !== "plan")?.url ?? "/media/demo/villa-dusk.jpg"}
                alt={selected.media[0]?.altText ?? `${selected.title} exterior`}
                fill
                sizes="(max-width: 640px) 100vw, 384px"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian/45 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-ink-700 backdrop-blur transition hover:bg-white"
                aria-label="Close property details"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                <div>
                  <p className="label-micro text-white/70">{selected.code} · {typologyHeadline(selected.typology)}</p>
                  <p className="display mt-1 text-[1.9rem] leading-none text-white">{selected.title}</p>
                </div>
                <span className={cn(
                  "rounded-full border px-2.5 py-1 text-[0.65rem] font-medium",
                  selected.status === "available" && "border-white/30 bg-white/90 text-[#4f5b44]",
                  selected.status === "reserved" && "border-white/30 bg-[#f2e9dc] text-[#7c6440]",
                  selected.status === "sold" && "border-white/20 bg-obsidian text-porcelain",
                  selected.status === "hidden" && "border-white/30 bg-white/80 text-ink-500",
                )}>
                  {PROPERTY_STATUS_LABELS[selected.status]}
                </span>
              </div>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto">
              <div className="flex gap-1 border-b border-ink-900/10 px-4 pt-3">
                {(["overview", "plan", "gallery"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPanelTab(tab)}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-2 text-[0.72rem] font-medium capitalize transition",
                      panelTab === tab ? "border-obsidian text-obsidian" : "border-transparent text-ink-400 hover:text-ink-700",
                    )}
                    aria-pressed={panelTab === tab}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {panelTab === "overview" && (
                <div className="p-4 sm:p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="display text-[1.7rem] leading-none">{formatCurrency(selected.priceCents, selected.currency)}</p>
                    <p className="text-[0.68rem] text-ink-400">{selected.currency}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-ink-900/10 py-3 text-center">
                    <div>
                      <dt className="label-micro text-ink-400">Useful</dt>
                      <dd className="mt-1.5 text-sm tabular">{formatArea(selected.usableAreaM2)}</dd>
                    </div>
                    <div>
                      <dt className="label-micro text-ink-400">Outdoor</dt>
                      <dd className="mt-1.5 text-sm tabular">{formatArea(selected.outdoorAreaM2)}</dd>
                    </div>
                    <div>
                      <dt className="label-micro text-ink-400">Bedrooms</dt>
                      <dd className="mt-1.5 text-sm tabular">{selected.bedrooms}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-[0.82rem] leading-relaxed text-ink-600">{selected.description}</p>
                  <p className="mt-3 label-micro text-ink-400">Typology {selected.typology} · {TYPOLOGY_CATALOGUE[selected.typology].character}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-ink-900/12 bg-white/70 px-2.5 py-1 text-[0.66rem] text-ink-600">
                      <Layers className="h-3 w-3" aria-hidden /> Private plot with boundary walls
                    </span>
                    {selectedPool ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-clay-500/40 bg-clay-500/15 px-2.5 py-1 text-[0.66rem] text-clay-700">
                        <Waves className="h-3 w-3" aria-hidden /> Private pool {selectedPool.width.toFixed(1)} × {selectedPool.depth.toFixed(1)} m
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-ink-900/12 bg-white/70 px-2.5 py-1 text-[0.66rem] text-ink-600">
                        <Waves className="h-3 w-3" aria-hidden /> Garden, no pool
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full border border-ink-900/12 bg-white/70 px-2.5 py-1 text-[0.66rem] text-ink-600">
                      <CarFront className="h-3 w-3" aria-hidden />
                      {selected.typology === "T3" || selected.typology === "T4" ? "Double carport" : "Private carport"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-ink-900/12 bg-white/70 px-2.5 py-1 text-[0.66rem] text-ink-600">
                      <Trophy className="h-3 w-3" aria-hidden /> 2 min walk to the sports park
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-ink-900/12 bg-white/70 px-2.5 py-1 text-[0.66rem] text-ink-600">
                      <Waves className="h-3 w-3" aria-hidden /> Shared lagoon and pavilion
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {selected.features.slice(0, 6).map((feature) => (
                      <span key={feature} className="rounded-full border border-ink-900/12 bg-white/70 px-2.5 py-1 text-[0.66rem] text-ink-600">
                        {feature}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-[0.62rem] leading-relaxed text-ink-400">
                    Demonstration data. Areas, prices and specifications are prototypes pending architectural and commercial validation.
                  </p>
                </div>
              )}

              {panelTab === "plan" && (
                <div className="p-4 sm:p-5">
                  <div className="overflow-hidden rounded-sm border border-ink-900/10 bg-[#f8f6ef]">
                    <FloorPlan2D typology={selected.typology} title={`${selected.title} floor plan`} />
                  </div>
                  <div className="mt-3">
                    <PlanLegend />
                  </div>
                </div>
              )}

              {panelTab === "gallery" && (
                <div className="grid grid-cols-2 gap-2 p-4 sm:p-5">
                  {selected.media.filter((m) => m.kind !== "plan").slice(0, 6).map((media) => (
                    <div key={media.id} className="relative aspect-[4/3] overflow-hidden rounded-sm bg-ink-100">
                      <Image src={media.url} alt={media.altText ?? media.caption ?? selected.title} fill sizes="180px" className="object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-ink-900/10 bg-porcelain/95 p-3 sm:p-4">
              <div className="flex gap-2">
                <Link
                  href={`/properties/${selected.slug}`}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-sm bg-obsidian px-3 text-[0.78rem] font-medium text-porcelain transition hover:bg-ink-800"
                >
                  View residence
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={() => setInteriorOpen(true)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-sm border border-ink-900/15 bg-white px-3 text-[0.78rem] font-medium text-ink-700 transition hover:border-ink-900/35"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Interior
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Link href={`/visit?property=${selected.code}`} className="inline-flex items-center gap-1.5 text-[0.72rem] text-ink-600 underline underline-offset-4 hover:text-obsidian">
                  <CalendarDays className="h-3 w-3" aria-hidden /> Book a private visit
                </Link>
                {isAdmin && (
                  <Link href={`/admin/properties/${selected.id}`} className="text-[0.72rem] text-ink-500 underline underline-offset-4 hover:text-obsidian">
                    Edit in admin
                  </Link>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Interior overlay */}
      <AnimatePresence>
        {interiorOpen && selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-50 bg-porcelain"
          >
            <InteriorExperience
              property={selected}
              isAdmin={isAdmin}
              timeOfDay={timeOfDay}
              onTimeOfDayChange={setTimeOfDay}
              onClose={() => setInteriorOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Non-WebGL fallback ───────────────────────────────────────────────── */

function FallbackScene({ entries, onSelect }: { entries: ExperienceEntry[]; onSelect: (id: string) => void }) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-[#dfe2d5] px-4 pb-40 pt-24">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-md border border-ink-900/10 bg-porcelain/95 p-5 shadow-panel">
          <p className="label-micro text-ink-400">3D unavailable</p>
          <h2 className="display mt-2 text-3xl">Browse the masterplan</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
            This device or browser does not provide WebGL. The condominium plan and every residence remain fully accessible below.
          </p>
          <div className="mt-4 aspect-[4/3] overflow-hidden rounded-sm border border-ink-900/10 bg-white">
            <Image src="/media/demo/masterplan.jpg" alt="Condominium masterplan" width={1600} height={1200} className="h-full w-full object-cover" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {entries.map((entry) => (
              <button
                key={entry.property.id}
                type="button"
                onClick={() => onSelect(entry.property.id)}
                className="flex items-center justify-between rounded-sm border border-ink-900/10 bg-white px-3 py-2 text-left text-sm transition hover:border-ink-900/30"
              >
                <span>
                  <span className="font-medium">{entry.property.code}</span>
                  <span className="ml-2 text-xs text-ink-400">{entry.property.typology}</span>
                </span>
                <span className="text-[0.66rem] text-ink-400">{PROPERTY_STATUS_LABELS[entry.property.status]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
