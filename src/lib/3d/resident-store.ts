/**
 * Live statistics for the resident population.
 *
 * The renderer moves people at 60 fps by writing instance matrices. It must
 * never set React state per frame. This store is the bridge: the scene
 * publishes a small snapshot four times a second and the debug panel subscribes
 * with `useSyncExternalStore`, so React re-renders at 4 Hz and only while the
 * panel is open.
 */

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
  /** Bodies written to the GPU this frame (all of them, every frame). */
  added: number;
  /** Bodies inside the camera frustum. */
  visible: number;
  walking: number;
  pausing: number;
  interacting: number;
  idle: number;
  conversationsStarted: number;
  conversationsEnded: number;
  navFailures: number;
  /** Anything that stopped residents from being drawn. */
  errors: string[];
  selected: ResidentSample | null;
  /** Up to four residents, for the "who is where" list. */
  sample: ResidentSample[];
  running: boolean;
  updatedAt: number;
}

const EMPTY: ResidentSnapshot = {
  created: 0,
  added: 0,
  visible: 0,
  walking: 0,
  pausing: 0,
  interacting: 0,
  idle: 0,
  conversationsStarted: 0,
  conversationsEnded: 0,
  navFailures: 0,
  errors: [],
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
