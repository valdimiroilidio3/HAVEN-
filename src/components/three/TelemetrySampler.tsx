"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { publishTelemetry, resetTelemetry } from "./telemetry";

/**
 * Samples the renderer once every 500 ms and publishes the result.
 *
 * `gl.info.render` is reset by three.js after each frame, and `useFrame`
 * callbacks run before the frame is drawn, so the counters read here describe
 * the frame that just finished — a 16 ms lag, which is invisible in a HUD.
 */
const SAMPLE_INTERVAL = 0.5;

export function TelemetrySampler() {
  const gl = useThree((state) => state.gl);
  const windowStart = React.useRef(0);
  const frames = React.useRef(0);

  React.useEffect(() => resetTelemetry(), []);

  useFrame((_, delta) => {
    frames.current += 1;
    windowStart.current += delta;
    if (windowStart.current < SAMPLE_INTERVAL) return;

    const elapsed = windowStart.current;
    const fps = frames.current / elapsed;
    const info = gl.info;
    publishTelemetry({
      fps: Math.round(fps * 10) / 10,
      frameMs: Math.round((elapsed / frames.current) * 1000 * 10) / 10,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      uptime: Math.round((performance.now() / 1000) * 10) / 10,
    });
    frames.current = 0;
    windowStart.current = 0;
  });

  return null;
}
