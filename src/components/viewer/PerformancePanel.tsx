"use client";

import * as React from "react";
import { Activity, X } from "lucide-react";
import { useSceneTelemetry } from "@/components/three/telemetry";
import { cn } from "@/lib/utils";

/**
 * Performance HUD for the masterplan.
 *
 * Everything shown is measured by the renderer that is drawing the scene in the
 * visitor's browser: `gl.info` draw calls and triangles, and the frame clock for
 * FPS. It exists so performance claims can be checked on a real device instead
 * of being estimated from the data model.
 */

export interface PerformancePanelProps {
  open: boolean;
  onClose: () => void;
  lowQuality: boolean;
  timeOfDay: "day" | "night";
}

const HISTORY = 48;

function rating(fps: number): { label: string; tone: string } {
  if (fps >= 55) return { label: "smooth", tone: "text-[#3f5b3c]" };
  if (fps >= 40) return { label: "usable", tone: "text-[#8a6a34]" };
  if (fps > 0) return { label: "heavy", tone: "text-[#8c3b32]" };
  return { label: "warming up", tone: "text-ink-400" };
}

export function PerformancePanel({ open, onClose, lowQuality, timeOfDay }: PerformancePanelProps) {
  const telemetry = useSceneTelemetry();
  const [history, setHistory] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!open || !telemetry.live) return;
    setHistory((previous) => [...previous.slice(-(HISTORY - 1)), telemetry.fps]);
  }, [open, telemetry.live, telemetry.fps, telemetry.uptime]);

  React.useEffect(() => {
    if (!open) setHistory([]);
  }, [open]);

  if (!open) return null;

  const { label, tone } = rating(telemetry.fps);
  const max = Math.max(60, ...history);
  const points = history
    .map((value, index) => `${(index / Math.max(1, HISTORY - 1)) * 100},${100 - (value / max) * 100}`)
    .join(" ");

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-40 w-[15.5rem] rounded-md border border-white/50 bg-white/85 px-3 py-2.5 font-mono text-[0.66rem] text-ink-700 shadow-[0_10px_30px_rgba(20,24,22,0.18)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.16em] text-ink-500">
          <Activity className="h-3 w-3" aria-hidden /> Renderer
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          aria-label="Close performance panel"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>

      {!telemetry.live ? (
        <p className="text-ink-400">Waiting for the first frame…</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-ink-500">FPS</span>
            <span className="text-[0.95rem] font-semibold tabular-nums text-ink-900">
              {telemetry.fps.toFixed(0)}
              <span className={cn("ml-1.5 text-[0.6rem] font-normal", tone)}>{label}</span>
            </span>
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-1 h-8 w-full" aria-hidden>
            <polyline points={points} fill="none" stroke="#6f7a62" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <dl className="mt-1.5 space-y-0.5">
            <Metric label="frame" value={`${telemetry.frameMs.toFixed(1)} ms`} />
            <Metric label="draw calls" value={telemetry.drawCalls.toLocaleString("pt-PT")} />
            <Metric label="triangles" value={telemetry.triangles.toLocaleString("pt-PT")} />
            <Metric label="geometries" value={telemetry.geometries.toLocaleString("pt-PT")} />
            <Metric label="textures" value={telemetry.textures.toLocaleString("pt-PT")} />
            <Metric label="programs" value={telemetry.programs.toLocaleString("pt-PT")} />
            <Metric label="quality" value={lowQuality ? "performance" : "full"} />
            <Metric label="light" value={timeOfDay} />
          </dl>
          <p className="mt-2 border-t border-ink-200/70 pt-1.5 text-[0.58rem] leading-relaxed text-ink-400">
            Measured live by this WebGL context.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular-nums text-ink-800">{value}</dd>
    </div>
  );
}
