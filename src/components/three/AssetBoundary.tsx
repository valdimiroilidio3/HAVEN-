"use client";

import * as React from "react";
import { useGLTF } from "@react-three/drei";

/**
 * Error isolation for external 3D assets: a missing or corrupt model must never
 * take down the administration interface. The procedural prototype is used as
 * the fallback in the condominium scene.
 */
export class AssetBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; onError?: (error: Error) => void },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    console.warn("[HAVEN] 3D asset failed to load:", error.message);
    this.props.onError?.(error);
  }

  override render(): React.ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export function GltfModel({ url, scale = 1 }: { url: string; scale?: number }) {
  const gltf = useGLTF(url);
  const scene = React.useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={scene} scale={scale} />;
}
