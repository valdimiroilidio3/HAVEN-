/**
 * Live statistics for the resident population.
 *
 * The renderer moves people at 60 fps by writing instance matrices. It must
 * never set React state per frame. This store is the bridge: the scene
 * publishes a small snapshot four times a second and the debug panel subscribes
 * with `useSyncExternalStore`, so React re-renders at 4 Hz and only while the
 * panel is open.
 */

import { createResidentSim, type ResidentSim, type ResidentWorld } from "./residents";

export interface ResidentSample {
  id: string;
  state: string;
  activity: string;
  x: number;
  z: number;
  /** Where this resident is heading: node index and coordinates. */
  target: string;
  /** Metres walked since creation. */
  travelled: number;
}

export interface ResidentSnapshot {
  /** Bodies the simulation created. */
  created: number;
  /** Instances written into the GPU buffers this frame (22 per body). */
  instances: number;
  /** Bodies whose centre is inside the current camera frustum. */
  inFrustum: number;
  walking: number;
  pausing: number;
  interacting: number;
  idle: number;
  conversationsStarted: number;
  conversationsEnded: number;
  navFailures: number;
  /** Meetings that could not be planned because the network is split there. */
  unreachableMeetings: number;
  /** Walkers pulled out of a jam (should be rare, never permanent). */
  stuckRecoveries: number;
  /** Anything that stopped residents from being drawn. */
  errors: string[];
  /** Draw calls for the whole scene this frame, as context for the cost. */
  sceneDrawCalls: number;
  selected: ResidentSample | null;
  /** Up to four residents, for the "who is where" list. */
  sample: ResidentSample[];
  running: boolean;
  updatedAt: number;
}

const EMPTY: ResidentSnapshot = {
  created: 0,
  instances: 0,
  inFrustum: 0,
  walking: 0,
  pausing: 0,
  interacting: 0,
  idle: 0,
  conversationsStarted: 0,
  conversationsEnded: 0,
  navFailures: 0,
  unreachableMeetings: 0,
  stuckRecoveries: 0,
  errors: [],
  sceneDrawCalls: 0,
  selected: null,
  sample: [],
  running: true,
  updatedAt: 0,
};

let snapshot: ResidentSnapshot = EMPTY;
const listeners = new Set<() => void>();

export function publishResidentSnapshot(next: ResidentSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeResidentSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getResidentSnapshot(): ResidentSnapshot {
  return snapshot;
}

/** Cleared when the scene unmounts, so a stale count never survives navigation. */
export function clearResidentSnapshot(): void {
  selection = null;
  publishResidentSnapshot(EMPTY);
}

/**
 * Which resident is selected, by simulation index. Clicking a body in the scene
 * and the arrows in the debug panel both write here.
 */
let selection: number | null = null;

export function setResidentSelection(index: number | null): void {
  selection = index;
}

export function getResidentSelection(): number | null {
  return selection;
}

/* ------------------------------------------------------------------ *
 * The population session
 * ------------------------------------------------------------------ */

/**
 * One simulation for the whole browser session.
 *
 * It used to live inside the React component, so any remount — a WebGL
 * recovery, a route change, StrictMode in development — silently reset everyone
 * to their spawn points. The session outlives the component: leaving and coming
 * back finds the same people where they were.
 */
interface ResidentSession {
  sim: ResidentSim;
  world: ResidentWorld;
  count: number;
}

let session: ResidentSession | null = null;
let running = true;

export function acquireResidentSession(world: ResidentWorld, count: number, seed: number): { sim: ResidentSim; reused: boolean } {
  if (session && session.world === world && session.count === count) {
    return { sim: session.sim, reused: true };
  }
  session = { sim: createResidentSim(world, { count, seed }), world, count };
  return { sim: session.sim, reused: false };
}

/** Throw the population away and build a new one (the regenerate control). */
export function resetResidentSession(): void {
  session = null;
}

export function setResidentRunning(next: boolean): void {
  running = next;
}

export function isResidentRunning(): boolean {
  return running;
}

export interface ResidentControls {
  regenerate: () => void;
  setRunning: (running: boolean) => void;
}

let controls: ResidentControls | null = null;

export function registerResidentControls(next: ResidentControls | null): void {
  controls = next;
}

export function getResidentControls(): ResidentControls | null {
  return controls;
}
