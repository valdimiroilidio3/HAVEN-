import type { Property } from "@/lib/domain/types";

/** One placed house, as the public viewer hands it to the scene. */
export interface SceneEntry {
  property: Property;
  position: { x: number; z: number };
  rotationY: number;
}
