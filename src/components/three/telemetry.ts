"use client";

import * as React from "react";

/**
 * Live renderer telemetry.
 *
 * Numbers here come from the running WebGL renderer (`gl.info`) and from the
 * frame clock — not from a spreadsheet. A `<TelemetrySampler>` inside the canvas
 * publishes them; any HUD outside the canvas subscribes through
 * `useSceneTelemetry()`.
 *
 * Sampling is throttled to twice a second so the readout does not fight the
 * render loop, and the store is module-level so the HUD can live in normal DOM
 * without re-rendering the scene tree.
 */

export interface SceneTelemetry {
  /** Frames per second averaged over the last sampling window. */
  fps: number;
  /** Mean frame time in milliseconds. */
  frameMs: number;
  /** Draw calls issued in the last sampled frame. */
  drawCalls: number;
  /** Triangles submitted in the last sampled frame. */
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  /** Seconds since the first sample. */
  uptime: number;
  /** False until the first sample lands. */
  live: boolean;
}

const INITIAL: SceneTelemetry = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  uptime: 0,
  live: false,
};

let state: SceneTelemetry = INITIAL;
const listeners = new Set<() => void>();

function push(next: SceneTelemetry) {
  state = next;
  for (const listener of listeners) listener();
}

export function publishTelemetry(next: Omit<SceneTelemetry, "live">) {
  push({ ...next, live: true });
}

export function resetTelemetry() {
  push(INITIAL);
}

export function getSceneTelemetry(): SceneTelemetry {
  return state;
}

export function subscribeTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-renders the calling component whenever a new sample is published.
 * Values are read from the module store, so this never touches the R3F tree.
 */
export function useSceneTelemetry(): SceneTelemetry {
  return React.useSyncExternalStore(subscribeTelemetry, getSceneTelemetry, getSceneTelemetry);
}
