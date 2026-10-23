"use client";

import * as React from "react";
import { Footprints, Pause, Play, RefreshCw, Users, X } from "lucide-react";
import {
  getResidentControls,
  getResidentSnapshot,
  getResidentSelection,
  setResidentSelection,
  subscribeResidentSnapshot,
  type ResidentSnapshot,
} from "@/lib/3d/resident-store";

/**
 * Debug HUD for the residents.
 *
 * It reports what the renderer is actually doing — bodies created, bodies handed
 * to the GPU, bodies inside the frustum, how many are walking, how many
 * conversations have started and ended, navigation failures — plus the state and
 * destination of a selected resident. It lives in the viewer, not on a separate
 * admin page, because the point is to check the scene you are looking at.
 */

export interface ResidentsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ResidentsPanel({ open, onClose }: ResidentsPanelProps) {
  const snapshot = React.useSyncExternalStore(subscribeResidentSnapshot, getResidentSnapshot, getResidentSnapshot);
  const [running, setRunning] = React.useState(true);

  if (!open) return null;

  const selectedIndex = getResidentSelection();
  const controls = getResidentControls();
  const moving = snapshot.walking;
  const problems = [
    ...(snapshot.navFailures > 0 ? [`${snapshot.navFailures} navigation failure(s)`] : []),
    ...(snapshot.created === 0 ? ["no residents created"] : []),
    ...(snapshot.created > 0 && snapshot.instances === 0 ? ["no instances written to the GPU buffers"] : []),
    ...snapshot.errors,
  ];

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-40 w-[17rem] rounded-md border border-white/50 bg-white/88 px-3 py-2.5 font-mono text-[0.66rem] text-ink-700 shadow-[0_10px_30px_rgba(20,24,22,0.18)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.16em] text-ink-500">
          <Users className="h-3 w-3" aria-hidden /> Residents
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = !running;
              setRunning(next);
              controls?.setRunning(next);
            }}
            className="rounded-full p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label={running ? "Pause the simulation" : "Resume the simulation"}
          >
            {running ? <Pause className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => controls?.regenerate()}
            className="rounded-full p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Regenerate the population"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close residents panel"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        <Row label="created (simulation)" value={snapshot.created} />
        <Row label="instances in GPU buffers" value={snapshot.instances} />
        <Row label="bodies in camera frustum" value={snapshot.inFrustum} />
        <Row label="scene draw calls" value={snapshot.sceneDrawCalls} />
        <Row label="walking" value={snapshot.walking} />
        <Row label="pausing" value={snapshot.pausing} />
        <Row label="interacting" value={snapshot.interacting} />
        <Row label="conversations" value={`${snapshot.conversationsStarted} started · ${snapshot.conversationsEnded} ended`} />
        <Row label="navigation failures" value={snapshot.navFailures} warn={snapshot.navFailures > 0} />
        <Row label="unreachable meetings" value={snapshot.unreachableMeetings} warn={snapshot.unreachableMeetings > 0} />
        <Row label="stuck walkers recovered" value={snapshot.stuckRecoveries} />
        <Row label="simulation" value={snapshot.running ? "running" : "paused"} />
      </dl>
      <p className="mt-1 text-[0.55rem] leading-relaxed text-ink-400">
        Frustum uses the live camera matrix; occlusion by houses is not tested.
        The network is split in two where the outer walk crosses a plot, so some
        meetings are genuinely unreachable.
      </p>

      <div className="mt-2 flex items-center justify-between border-t border-ink-900/10 pt-1.5 text-[0.6rem] uppercase tracking-[0.12em] text-ink-500">
        <span className="flex items-center gap-1">
          <Footprints className="h-3 w-3" aria-hidden /> selected
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-1 text-ink-500 transition hover:bg-ink-100"
            onClick={() => stepSelection(snapshot, selectedIndex, -1)}
            aria-label="Previous resident"
          >
            ←
          </button>
          <button
            type="button"
            className="rounded px-1 text-ink-500 transition hover:bg-ink-100"
            onClick={() => stepSelection(snapshot, selectedIndex, 1)}
            aria-label="Next resident"
          >
            →
          </button>
        </span>
      </div>

      {snapshot.selected ? (
        <div className="mt-1 space-y-0.5">
          <p className="text-ink-800">
            {snapshot.selected.id} · {snapshot.selected.state} · {snapshot.selected.activity}
          </p>
          <p className="text-ink-500">
            at ({snapshot.selected.x.toFixed(1)}, {snapshot.selected.z.toFixed(1)}) → {snapshot.selected.target}
          </p>
          <p className="text-ink-400">{snapshot.selected.travelled.toFixed(1)} m walked</p>
        </div>
      ) : (
        <p className="mt-1 text-ink-400">Click a resident in the scene, or use ← →.</p>
      )}

      {problems.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 border-t border-ink-900/10 pt-1.5 text-[#8c3b32]">
          {problems.map((problem) => (
            <li key={problem}>! {problem}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 border-t border-ink-900/10 pt-1.5 text-[#3f5b3c]">no errors · {moving} moving</p>
      )}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className={warn ? "text-right text-[#8c3b32]" : "text-right text-ink-800"}>{value}</dd>
    </>
  );
}

function stepSelection(snapshot: ResidentSnapshot, current: number | null, direction: number): void {
  const total = snapshot.created;
  if (total === 0) return;
  const start = current ?? (direction > 0 ? -1 : 0);
  setResidentSelection((start + direction + total) % total);
}
