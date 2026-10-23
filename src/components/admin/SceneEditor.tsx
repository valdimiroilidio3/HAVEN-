"use client";

import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, Loader2, MousePointer2, RotateCcw, Save, Send, Undo2 } from "lucide-react";
import {
  publishSceneAction,
  resetSceneDraftAction,
  saveSceneDraftAction,
  type AdminState,
} from "@/lib/actions/admin";
import { PROPERTY_STATUS_LABELS, TYPOLOGIES, TYPOLOGY_CATALOGUE } from "@/lib/domain/constants";
import { getFloorPlan } from "@/lib/domain/floorplans";
import { HOUSE_CONFIG } from "@/components/three/house-geometry";
import type { PropertyStatus, PublicationStatus, Typology } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { validateScene, type SceneReport } from "@/lib/3d/validate";
import { SITE } from "@/lib/3d/site";
import { SITE_BOUNDS } from "@/lib/domain/validation";

export interface EditorProperty {
  id: string;
  code: string;
  title: string;
  typology: Typology;
  status: PropertyStatus;
  publication: PublicationStatus;
  x: number;
  z: number;
  rotationY: number;
  publishedX: number;
  publishedZ: number;
  publishedRotationY: number;
  draftUpdatedAt: string | null;
}

interface Placement {
  x: number;
  z: number;
  rotationY: number;
}

// The editor edits the same site the public scene renders, so the bounds come
// from the domain constants rather than a second hard-coded copy.
const SITE_HALF_W = Math.max(Math.abs(SITE_BOUNDS.minX), Math.abs(SITE_BOUNDS.maxX));
const SITE_HALF_D = Math.max(Math.abs(SITE_BOUNDS.minZ), Math.abs(SITE_BOUNDS.maxZ));
const HOUSE_COLORS: Record<Typology, string> = { T1: "#d9d3c4", T2: "#c9c0ab", T3: "#bdb4a1", T4: "#a9a08c" };
/**
 * Footprints come from the floor plans, never from a second table.
 *
 * This used to be a hard-coded {7.6 × 9.2, 8.4 × 10.2, …} that disagreed with
 * `getFloorPlan` on every typology, so the editor drew and described houses at
 * sizes the 3D scene never used.
 */
const FOOTPRINT: Record<Typology, { w: number; d: number; h: number }> = Object.fromEntries(
  TYPOLOGIES.map((typology) => {
    const plan = getFloorPlan(typology);
    const config = HOUSE_CONFIG[typology]!;
    return [typology, { w: plan.widthM, d: plan.depthM, h: config.groundH + config.upperH }];
  }),
) as Record<Typology, { w: number; d: number; h: number }>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;
const normalizeAngle = (value: number) => ((Math.round(value) % 360) + 360) % 360;

const initialState = (properties: EditorProperty[]): Record<string, Placement> =>
  Object.fromEntries(properties.map((property) => [property.id, { x: property.x, z: property.z, rotationY: property.rotationY }]));

function SubmitButton({ label, icon, tone = "primary" }: { label: string; icon: React.ReactNode; tone?: "primary" | "quiet" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-sm px-4 text-xs font-medium transition disabled:opacity-50",
        tone === "primary" ? "bg-obsidian text-porcelain hover:bg-ink-800" : "border border-ink-900/15 bg-white text-obsidian hover:border-ink-900/35",
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {pending ? "Working…" : label}
    </button>
  );
}

export function SceneEditor({
  properties,
  canPublish,
  publishedAt,
  publishedBy,
  draftFingerprint,
}: {
  properties: EditorProperty[];
  canPublish: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  /** Fingerprint of the draft this page was rendered from (see scene-publication). */
  draftFingerprint: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Record<string, Placement>>(() => initialState(properties));
  const [selectedId, setSelectedId] = React.useState<string | null>(properties[0]?.id ?? null);
  const [view, setView] = React.useState<"site" | "plan">("site");
  const [onlyDirty, setOnlyDirty] = React.useState(false);
  const [saveState, saveAction] = useActionState<AdminState, FormData>(saveSceneDraftAction, null);
  const [publishState, publishAction] = useActionState<AdminState, FormData>(publishSceneAction, null);
  const [resetState, resetAction] = useActionState<AdminState, FormData>(resetSceneDraftAction, null);

  React.useEffect(() => {
    setDraft(initialState(properties));
  }, [properties]);

  const baseline = React.useMemo(() => initialState(properties), [properties]);
  const dirtyIds = React.useMemo(
    () =>
      properties
        .filter((property) => {
          const current = draft[property.id];
          const base = baseline[property.id];
          return current && base && (current.x !== base.x || current.z !== base.z || current.rotationY !== base.rotationY);
        })
        .map((property) => property.id),
    [draft, baseline, properties],
  );
  const dirty = dirtyIds.length > 0;

  /**
   * Live spatial check of the draft.
   *
   * Moving a house re-runs the same validator the audit and the "Scene health"
   * page use, debounced so dragging stays smooth. `vegetation` is skipped here
   * only because the estate scatter costs more than it tells a manager while
   * nudging a box; plot geometry (walls, pool, carport, garden planting) is
   * always checked.
   */
  const draftEntries = React.useMemo(
    () =>
      properties.flatMap((property) => {
        const placement = draft[property.id];
        if (!placement) return [];
        return [
          {
            property: { code: property.code, typology: property.typology },
            position: { x: placement.x, z: placement.z },
            rotationY: placement.rotationY,
          },
        ];
      }),
    [properties, draft],
  );

  const [check, setCheck] = React.useState<SceneReport | null>(null);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setCheck(validateScene({ entries: draftEntries, vegetation: false })), 160);
    return () => window.clearTimeout(timer);
  }, [draftEntries]);

  const codeToId = React.useMemo(() => new Map(properties.map((property) => [property.code, property.id])), [properties]);
  const conflicts = React.useMemo(() => {
    const set = new Set<string>();
    for (const finding of check?.findings ?? []) {
      if (finding.severity !== "critical" && finding.severity !== "high") continue;
      const id = codeToId.get(finding.subject);
      if (id) set.add(id);
    }
    return set;
  }, [check, codeToId]);

  const selected = properties.find((property) => property.id === selectedId) ?? null;
  const selectedPlacement = selected ? draft[selected.id] : null;

  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  React.useEffect(() => {
    if (saveState?.ok) router.refresh();
  }, [saveState, router]);

  React.useEffect(() => {
    if (publishState?.ok) router.refresh();
  }, [publishState, router]);

  const update = React.useCallback((id: string, patch: Partial<Placement>) => {
    setDraft((current) => {
      const existing = current[id];
      if (!existing) return current;
      return {
        ...current,
        [id]: {
          x: round(clamp(patch.x ?? existing.x, -SITE_HALF_W, SITE_HALF_W)),
          z: round(clamp(patch.z ?? existing.z, -SITE_HALF_D, SITE_HALF_D)),
          rotationY: normalizeAngle(patch.rotationY ?? existing.rotationY),
        },
      };
    });
  }, []);

  const discard = () => setDraft(initialState(properties));

  const payload = JSON.stringify(
    properties.map((property) => ({
      propertyId: property.id,
      ...(draft[property.id] ?? { x: property.x, z: property.z, rotationY: property.rotationY }),
    })),
  );

  const visible = onlyDirty ? properties.filter((property) => dirtyIds.includes(property.id)) : properties;

  return (
    <div className="grid gap-4 xl:grid-cols-[290px_1fr_290px]">
      {/* Property list */}
      <section className="order-2 overflow-hidden rounded-md border border-ink-900/10 bg-[#fbfbf8] xl:order-1">
        <header className="flex items-center justify-between gap-2 border-b border-ink-900/10 px-3 py-2.5">
          <h2 className="text-[0.76rem] font-medium text-obsidian">Homes</h2>
          <label className="flex items-center gap-1.5 text-[0.62rem] text-ink-500">
            <input type="checkbox" checked={onlyDirty} onChange={(event) => setOnlyDirty(event.target.checked)} className="h-3 w-3 accent-[#2f3a2f]" />
            changed
          </label>
        </header>
        <ul className="max-h-[520px] divide-y divide-ink-900/[0.06] overflow-y-auto scroll-thin">
          {visible.map((property) => {
            const isDirty = dirtyIds.includes(property.id);
            return (
              <li key={property.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(property.id)}
                  aria-pressed={selectedId === property.id}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left transition",
                    selectedId === property.id ? "bg-obsidian text-porcelain" : "hover:bg-white",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isDirty ? "bg-clay-500" : selectedId === property.id ? "bg-porcelain/40" : "bg-ink-200")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.74rem]">
                      {property.code} · {property.title}
                    </span>
                    <span className={cn("block text-[0.62rem]", selectedId === property.id ? "text-porcelain/50" : "text-ink-400")}>
                      {property.typology} · {PROPERTY_STATUS_LABELS[property.status]}
                      {property.publication !== "published" ? ` · ${property.publication}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-3 py-6 text-center text-[0.7rem] text-ink-400">No changed placements.</li>}
        </ul>
      </section>

      {/* Viewport */}
      <section className="order-1 overflow-hidden rounded-md border border-ink-900/10 bg-[#e9e6dd] xl:order-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-900/10 bg-[#fbfbf8] px-3 py-2">
          <div className="flex items-center gap-1">
            {(["site", "plan"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-[0.66rem] capitalize transition",
                  view === mode ? "bg-obsidian text-porcelain" : "text-ink-500 hover:bg-ink-900/[0.06]",
                )}
              >
                {mode === "site" ? "Site view" : "Plan view"}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-[0.62rem] text-ink-400">
            <MousePointer2 className="h-3 w-3" aria-hidden /> drag a home · arrows nudge · Q/E rotate
          </p>
        </div>
        <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
          <Canvas shadows dpr={[1, 1.6]} camera={view === "plan" ? { position: [0, 168, 0.1], fov: 34 } : { position: [96, 74, 128], fov: 38 }}>
            <color attach="background" args={["#e9e6dd"]} />
            <fog attach="fog" args={["#e9e6dd", 120, 260]} />
            <hemisphereLight args={["#f4efe2", "#8d8d7a", 0.85]} />
            <directionalLight
              position={[-42, 58, 36]}
              intensity={1.55}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
              shadow-camera-left={-70}
              shadow-camera-right={70}
              shadow-camera-top={70}
              shadow-camera-bottom={-70}
            />
            <EditorScene
              properties={properties}
              draft={draft}
              selectedId={selectedId}
              view={view}
              onSelect={setSelectedId}
              onMove={(id, x, z) => update(id, { x, z })}
              conflicts={conflicts}
            />
            <OrbitControls
              makeDefault
              enablePan
              enableZoom
              enableRotate={view === "site"}
              maxPolarAngle={view === "plan" ? 0.02 : Math.PI / 2.35}
              minDistance={24}
              maxDistance={190}
              target={[0, 0, 2]}
            />
          </Canvas>
        </div>
        <DraftCheck report={check} entries={draftEntries} onFocus={(code) => setSelectedId(codeToId.get(code) ?? null)} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-900/10 bg-[#fbfbf8] px-3 py-2 text-[0.62rem] text-ink-500">
          <span>
            {dirty ? `${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? "" : "s"}` : "No unsaved changes"}
          </span>
          <span>
            Published {publishedAt ? new Date(publishedAt).toLocaleDateString("en-GB") : "never"}
            {publishedBy ? ` by ${publishedBy}` : ""}
          </span>
        </div>
      </section>

      {/* Inspector */}
      <section className="order-3 space-y-3 rounded-md border border-ink-900/10 bg-[#fbfbf8] p-3">
        {selected && selectedPlacement ? (
          <>
            <div>
              <p className="label-micro text-ink-400">{selected.typology} · {TYPOLOGY_CATALOGUE[selected.typology].label}</p>
              <h2 className="mt-1 text-[0.95rem] leading-tight text-obsidian">{selected.title}</h2>
              <p className="text-[0.66rem] text-ink-400">{selected.code}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["x", "z"] as const).map((axis) => (
                <label key={axis} className="block">
                  <span className="label-micro mb-1 block text-ink-400">{axis.toUpperCase()} (m)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedPlacement[axis]}
                    onChange={(event) => update(selected.id, { [axis]: Number(event.target.value) })}
                    className="h-8 w-full rounded-sm border border-ink-900/15 bg-white px-2 text-[0.74rem] tabular text-obsidian focus:border-ink-900/40 focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: "←", dx: -0.5, dz: 0 },
                { label: "→", dx: 0.5, dz: 0 },
                { label: "↑", dx: 0, dz: -0.5 },
                { label: "↓", dx: 0, dz: 0.5 },
              ].map((control) => (
                <button
                  key={control.label}
                  type="button"
                  onClick={() => update(selected.id, { x: selectedPlacement.x + control.dx, z: selectedPlacement.z + control.dz })}
                  className="h-7 rounded-sm border border-ink-900/12 bg-white text-[0.7rem] text-ink-600 hover:border-ink-900/35"
                  aria-label={`Nudge ${control.label}`}
                >
                  {control.label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="label-micro mb-1 block text-ink-400">Rotation (degrees)</span>
              <input
                type="number"
                step="15"
                value={selectedPlacement.rotationY}
                onChange={(event) => update(selected.id, { rotationY: Number(event.target.value) })}
                className="h-8 w-full rounded-sm border border-ink-900/15 bg-white px-2 text-[0.74rem] tabular text-obsidian focus:border-ink-900/40 focus:outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => update(selected.id, { rotationY: selectedPlacement.rotationY - 15 })}
                className="h-7 rounded-sm border border-ink-900/12 bg-white text-[0.66rem] text-ink-600 hover:border-ink-900/35"
              >
                −15°
              </button>
              <button
                type="button"
                onClick={() => update(selected.id, { rotationY: selectedPlacement.rotationY + 15 })}
                className="h-7 rounded-sm border border-ink-900/12 bg-white text-[0.66rem] text-ink-600 hover:border-ink-900/35"
              >
                +15°
              </button>
            </div>

            <dl className="space-y-1 border-t border-ink-900/10 pt-2 text-[0.64rem] text-ink-500">
              <div className="flex justify-between">
                <dt>Published position</dt>
                <dd className="tabular">
                  {selected.publishedX.toFixed(1)}, {selected.publishedZ.toFixed(1)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Draft edited</dt>
                <dd>{selected.draftUpdatedAt ? new Date(selected.draftUpdatedAt).toLocaleDateString("en-GB") : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Footprint</dt>
                <dd className="tabular">
                  {FOOTPRINT[selected.typology].w} × {FOOTPRINT[selected.typology].d} m
                </dd>
              </div>
            </dl>

            <button
              type="button"
              disabled={!dirtyIds.includes(selected.id)}
              onClick={() => {
                const base = baseline[selected.id];
                if (base) update(selected.id, base);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-ink-900/15 bg-white py-1.5 text-[0.66rem] text-ink-600 hover:border-ink-900/35 disabled:opacity-40"
            >
              <Undo2 className="h-3 w-3" aria-hidden /> Revert this home
            </button>
          </>
        ) : (
          <p className="text-[0.74rem] text-ink-400">Select a home to edit its placement.</p>
        )}
      </section>

      {/* Actions */}
      <div className="order-4 flex flex-wrap items-center gap-2 rounded-md border border-ink-900/10 bg-[#fbfbf8] px-3 py-2.5 xl:col-span-3">
        <form action={saveAction} className="contents">
          <input type="hidden" name="items" value={payload} />
          <SubmitButton label="Save draft" icon={<Save className="h-3.5 w-3.5" aria-hidden />} />
        </form>
        <form action={publishAction} className="contents">
          <input type="hidden" name="draftDirty" value={String(dirty)} />
          {/* The server refuses to publish if this draft has moved on since the page loaded. */}
          <input type="hidden" name="draftFingerprint" value={draftFingerprint} />
          <SubmitButton
            label="Publish masterplan"
            icon={<Send className="h-3.5 w-3.5" aria-hidden />}
            tone="quiet"
          />
        </form>
        <form action={resetAction}>
          <SubmitButton label="Restore published" icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />} tone="quiet" />
        </form>
        <button
          type="button"
          onClick={discard}
          disabled={!dirty}
          className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs text-ink-500 hover:text-obsidian disabled:opacity-40"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden /> Discard
        </button>
        {!canPublish && <span className="text-[0.64rem] text-ink-400">Only administrators can publish.</span>}

        <div className="ml-auto max-w-md space-y-1">
          {[saveState, publishState, resetState].map((state, index) =>
            state ? (
              <div key={index} className="space-y-1">
                <p
                  role={state.ok ? "status" : "alert"}
                  className={cn("text-[0.66rem] leading-snug", state.ok ? "text-moss-700" : "text-[#8a2f22]")}
                >
                  {state.ok ? state.data.message : state.error}
                </p>
                {state.ok
                  ? state.data.warnings?.map((warning) => (
                      <p key={warning} className="text-[0.62rem] leading-snug text-ink-400">
                        {warning}
                      </p>
                    ))
                  : state.issues?.map((issue) => (
                      <p key={`${issue.objectId}-${issue.message}`} className="text-[0.62rem] leading-snug text-ink-600">
                        <span className="font-medium uppercase tracking-wide text-[#8a2f22]">{issue.severity}</span> {issue.message}{" "}
                        <span className="text-ink-400">{issue.suggestion}</span>
                      </p>
                    ))}
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 3D scene ─────────────────────────────────────────────────────────── */

function EditorScene({
  properties,
  draft,
  selectedId,
  view,
  onSelect,
  onMove,
  conflicts,
}: {
  properties: EditorProperty[];
  draft: Record<string, Placement>;
  selectedId: string | null;
  view: "site" | "plan";
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, z: number) => void;
  /** Houses with a critical or high finding in the live check. */
  conflicts: Set<string>;
}) {
  const [dragging, setDragging] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const property = properties.find((item) => item.id === dragging);
      const placement = property ? draft[dragging] : null;
      if (!property || !placement) return;
      if (event.target instanceof HTMLInputElement) return;
      const step = event.shiftKey ? 2 : 0.5;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onMove(property.id, placement.x - step, placement.z);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onMove(property.id, placement.x + step, placement.z);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        onMove(property.id, placement.x, placement.z - step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        onMove(property.id, placement.x, placement.z + step);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dragging, draft, properties, onMove]);

  const selected = properties.find((property) => property.id === selectedId);
  const selectedPlacement = selected ? draft[selected.id] : null;

  return (
    <group>
      {/* Ground */}
      <mesh
        rotation-x={-Math.PI / 2}
        receiveShadow
        onPointerMove={(event) => {
          if (!dragging) return;
          event.stopPropagation();
          onMove(dragging, event.point.x, event.point.z);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        <planeGeometry args={[SITE_HALF_W * 2, SITE_HALF_D * 2]} />
        <meshStandardMaterial color="#a9b092" roughness={1} />
      </mesh>

      <gridHelper args={[SITE_HALF_W * 2, 32, "#8c9179", "#9aa08a"]} position={[0, 0.02, 0]} />

      {/* Circuit road + lagoon, simplified from the site layout */}
      {(() => {
        const { outer, inner } = SITE.ring;
        const w = outer.maxX - outer.minX;
        const d = outer.maxZ - outer.minZ;
        return (
          <>
            <mesh rotation-x={-Math.PI / 2} position={[(outer.minX + outer.maxX) / 2, 0.03, (outer.minZ + outer.maxZ) / 2]}>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color="#b9b4a6" roughness={0.95} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[(inner.minX + inner.maxX) / 2, 0.035, (inner.minZ + inner.maxZ) / 2]}>
              <planeGeometry args={[inner.maxX - inner.minX, inner.maxZ - inner.minZ]} />
              <meshStandardMaterial color="#a9b092" roughness={1} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[(SITE.boulevard.minX + SITE.boulevard.maxX) / 2, 0.03, (SITE.boulevard.minZ + SITE.boulevard.maxZ) / 2]}>
              <planeGeometry args={[SITE.boulevard.maxX - SITE.boulevard.minX, SITE.boulevard.maxZ - SITE.boulevard.minZ]} />
              <meshStandardMaterial color="#b9b4a6" roughness={0.95} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[SITE.lagoon.x, 0.04, SITE.lagoon.z]} scale={[SITE.lagoon.radiusX, SITE.lagoon.radiusZ, 1]}>
              <circleGeometry args={[1, 64]} />
              <meshStandardMaterial color="#5aa8bd" roughness={0.2} metalness={0.35} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[SITE.sportsPark.minX + 14, 0.033, (SITE.sportsPark.minZ + SITE.sportsPark.maxZ) / 2]}>
              <planeGeometry args={[26, 100]} />
              <meshStandardMaterial color="#7d8f68" roughness={1} />
            </mesh>
          </>
        );
      })()}

      {properties.map((property) => {
        const placement = draft[property.id];
        if (!placement) return null;
        const footprint = FOOTPRINT[property.typology];
        const isSelected = property.id === selectedId;
        const conflicted = conflicts.has(property.id);
        return (
          <group
            key={property.id}
            position={[placement.x, 0, placement.z]}
            rotation-y={(placement.rotationY * Math.PI) / 180}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect(property.id);
              if (view === "site") setDragging(property.id);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              setDragging(null);
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "grab";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          >
            <mesh position={[0, footprint.h / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[footprint.w, footprint.h, footprint.d]} />
              <meshStandardMaterial
                color={isSelected ? "#c98a5f" : conflicted ? "#b1543f" : HOUSE_COLORS[property.typology]}
                roughness={0.82}
                metalness={0.02}
              />
            </mesh>
            <mesh position={[0, footprint.h + 0.18, 0]} castShadow>
              <boxGeometry args={[footprint.w + 0.5, 0.16, footprint.d + 0.5]} />
              <meshStandardMaterial color="#6b675c" roughness={0.9} />
            </mesh>
            {conflicted && (
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
                <ringGeometry args={[Math.max(footprint.w, footprint.d) * 0.62, Math.max(footprint.w, footprint.d) * 0.62 + 0.3, 48]} />
                <meshBasicMaterial color="#b1543f" side={THREE.DoubleSide} transparent opacity={0.85} />
              </mesh>
            )}
            <Html position={[0, footprint.h + 0.9, 0]} center distanceFactor={52} style={{ pointerEvents: "none" }}>
              <span
                style={{
                  fontFamily: "ui-sans-serif, system-ui",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: isSelected ? "#1c1c19" : "rgba(252,251,247,0.86)",
                  color: isSelected ? "#f5f2ea" : "#3b3a34",
                  whiteSpace: "nowrap",
                }}
              >
                {property.code}
              </span>
            </Html>
          </group>
        );
      })}

      {selected && selectedPlacement && (
        <mesh rotation-x={-Math.PI / 2} position={[selectedPlacement.x, 0.06, selectedPlacement.z]}>
          <ringGeometry
            args={[
              Math.max(FOOTPRINT[selected.typology].w, FOOTPRINT[selected.typology].d) * 0.72,
              Math.max(FOOTPRINT[selected.typology].w, FOOTPRINT[selected.typology].d) * 0.72 + 0.35,
              64,
            ]}
          />
          <meshBasicMaterial color="#b06a45" side={THREE.DoubleSide} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

/** Live result of the spatial check, shown under the viewport. */
function DraftCheck({
  report,
  entries,
  onFocus,
}: {
  report: SceneReport | null;
  entries: Array<{ property: { code: string } }>;
  onFocus: (code: string) => void;
}) {
  if (!report) {
    return (
      <div className="border-t border-ink-900/10 bg-[#fbfbf8] px-3 py-2 text-[0.62rem] text-ink-400">
        Checking the draft against the placement rules…
      </div>
    );
  }

  const blocking = report.findings.filter((finding) => finding.severity === "critical" || finding.severity === "high");
  const codes = new Set(entries.map((entry) => entry.property.code));
  const relevant = blocking.filter((finding) => codes.has(finding.subject) || codes.has(finding.objectId.split("/")[0]!));
  const shown = relevant.slice(0, 3);

  return (
    <div
      className={cn(
        "border-t px-3 py-2 text-[0.64rem]",
        relevant.length === 0 ? "border-ink-900/10 bg-[#f2f4ec] text-[#4a5a42]" : "border-[#b1543f]/30 bg-[#b1543f]/8 text-[#7d3a2b]",
      )}
      role="status"
      aria-live="polite"
    >
      {relevant.length === 0 ? (
        <p className="flex items-center gap-1.5">
          <span aria-hidden>✓</span>
          Placement clean · {report.checked.plots} plots, {report.checked.parts} parts checked
        </p>
      ) : (
        <>
          <p className="font-medium">
            {relevant.length} blocking {relevant.length === 1 ? "issue" : "issues"} in this draft
          </p>
          <ul className="mt-1 space-y-0.5">
            {shown.map((finding) => (
              <li key={`${finding.objectId}-${finding.message}`} className="flex flex-wrap items-baseline gap-1.5">
                <span className="rounded-sm bg-white/60 px-1 uppercase tracking-wide">{finding.severity}</span>
                <button type="button" onClick={() => onFocus(finding.subject)} className="underline underline-offset-2">
                  {finding.objectId}
                </button>
                <span className="text-[#7d3a2b]/80">{finding.message}</span>
              </li>
            ))}
          </ul>
          {relevant.length > shown.length && (
            <p className="mt-1 text-[0.6rem] opacity-80">+{relevant.length - shown.length} more · see Scene health</p>
          )}
        </>
      )}
    </div>
  );
}
