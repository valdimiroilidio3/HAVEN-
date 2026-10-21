# HAVEN® — 3D spatial audit

Audit of the condominium masterplan after the road/lagoon/sports-park rebuild (`95f9904`) and the
spatial-intelligence pass on this branch. Everything below is either executed in this workspace or
explicitly marked **unverified**.

---

## 1. The project

A single-condominium platform for **13 homes across four typologies (T1–T4)**:

| Layer | What it is |
| --- | --- |
| Public site | Editorial pages, property listings, lead capture, visit booking |
| 3D masterplan | Interactive orbit of the whole condominium, day/night, house selection, low/high quality |
| 3D interiors | First-person walkthrough of the T1–T4 floor plans with furniture |
| Admin | Property/media/lead/visit management plus a placement editor |
| Data | SQLite (default) or Supabase, behind one repository interface |

### Technology

Next.js 15 (App Router, React 19) · TypeScript strict · Tailwind · three.js with
`@react-three/fiber` + `@react-three/drei` · Drizzle/SQLite and Supabase drivers · Vitest ·
custom Node scripts for seeding, smoke checks, plan rendering and the new spatial audit.

---

## 2. How the scene is built

The 3D world is **procedural**: there are no imported models. Houses come from `house-geometry.ts`
(floors, walls, glazing, roof, planting baked per house), the estate from `SITE` in
`src/lib/3d/site.ts`, and the plots from declarative part descriptors.

```
src/lib/domain/inventory.ts        seed house codes, typologies, positions, rotations
src/lib/3d/site.ts                 THE source of placement: fence, ring, boulevard, service road,
                                   gate, lagoon, pavilion, sports park, beds, plot walls, pools,
                                   carports, driveways, scatter, lamps, plotFootprints()
src/lib/3d/parts.ts                plot geometry as data (walls, carport, cars, pool, furniture)
src/lib/3d/validate.ts             spatial rules → findings (severity, footprint, correction)
src/components/three/SiteScene.tsx composition root only (no coordinates of its own)
  ├── site/Roads.tsx               carriageways, kerbs, markings, driveways
  ├── site/Landscape.tsx           bed borders, instanced trees, shrubs, flowers
  ├── site/Plot.tsx                one merged mesh per material per plot
  ├── site/Lagoon.tsx              deck, water, pavilion, loungers, parasols
  ├── site/Boundary.tsx            perimeter wall, gate, gate sign
  └── site/environment.tsx         day/night themes, sun rig, moon, street lamps
scripts/scene-audit.ts             CLI: prints findings + scene budget, --strict exits 1
scripts/render-plan.ts             docs/masterplan.png (2D plan from the same data)
```

The important architectural property: **nothing is placed by eye**. Roads, plots, pools, carports,
beds and lamps are computed from `SITE` and the house list; the renderer and the validator consume
the same functions.

---

## 3. Defects found

Severity follows the classes in `validate.ts`:

- **CRITICAL** — the environment is unusable (building on a road, buildings overlapping, no access).
- **HIGH** — a functional defect (object through a fence, planting inside a private plot, collisions).
- **MEDIUM** — spatial composition (duplicated walls, furniture off its deck, over-long driveway).
- **LOW** — presentation (lamp on the carriageway, lamp inside a plot).

### 3.1 Before this pass

First run of `npx tsx scripts/scene-audit.ts` on the rebuild:

```
scene: 13 houses · 13 plots · 8 pools · 13 carports · 674 parts
findings: 0 critical, 3 high, 1 medium, 2 low
```

| Severity | Object | Evidence |
| --- | --- | --- |
| HIGH | `shrub@-9.26,73.21` | grows inside H09's private plot |
| HIGH | `shrub@8.37,74` | grows inside H11's private plot |
| HIGH | `shrub@8.93,70.66` | grows inside H11's private plot |
| MEDIUM | `lagoon/pavilion` | 11.0 × 5.5 m pavilion at (0, −13.6) not supported by the lagoon deck |
| LOW | `lamp@-42.6,32` | street lamp standing inside a private plot |
| LOW | `lamp@0,46.6` | street lamp standing on the boulevard carriageway |

### 3.2 Root causes

These six findings were not six mistakes. They were three missing rules:

1. **The private plot had no single authoritative rectangle.**
   The renderer derived plot walls from `plotWallsFor()`, the scatter functions knew only about
   *house* footprints, and the lamp generator knew about neither. So shrubs and lamps could land in
   a garden that the renderer had drawn around them. → *Fix:* `plotFootprint()` /
   `plotFootprints()` in `site.ts`, consumed by the renderer, the scatter functions, the lamp
   generator, the plan renderer and the validator.
2. **Scatter and edging had no keep-out channel.**
   `scatterTrees` accepted a `keepOut` circle list, `scatterShrubs` accepted nothing, and the hedge
   borders around planting beds were drawn from raw `PLANTING_BEDS` — two beds genuinely overlapped
   H09's and H11's plots by 22 m² and 45 m², so the hedge line crossed their walls.
   → *Fix:* every scatter function takes `exclude: Rect[]`; planting and flower beds are *clipped*
   against plots by `plantingBeds()` / `flowerBeds()` (rectangle subtraction), so the borders and the
   planting cannot disagree.
3. **Scene data and collision data had drifted.**
   The pavilion's coordinates were authored independently of `SITE.lagoon`, and lamp positions were a
   hard-coded grid in the renderer that did not know the gate approach or the plots.
   → *Fix:* pavilion moved onto the deck (`(0, −8.7)`, 11 × 4.2 m, inside the deck rectangle), and
   `lampPositions(exclude)` now skips the boulevard junction and rejects any point inside a plot,
   with `pointOnRoad` guards.

### 3.3 A fourth defect the audit itself produced

The validator had a declared rule — *"every house must reach the road network with a driveway shorter
than 24 m"* — backed by an empty loop. Implementing it surfaced a false positive of my own making: an
axis-aligned bounding box built from `max(width, length)` reported H10's driveway crossing H13. The
box was wrong, not the scene; `drivewayBounds()` now sizes the ribbon along its facing vector. This is
recorded because a validator that is never checked against a known-good scene is just decoration.

### 3.4 State after the corrections

```
scene: 13 houses · 13 plots · 8 pools · 13 carports · 674 parts
findings: 0 critical, 0 high, 0 medium, 0 low
budget: plots 164 draw calls (12.6/plot) · 12,760 triangles · 54 trees · 307 flowers
```

---

## 4. Corrected defects

| # | Defect | Correction (rule, not nudge) | Verified by |
| --- | --- | --- | --- |
| 1 | Shrubs/trees/flowers inside plots | scatter is clipped to `plantingBeds(exclude)`; all scatter functions reject plot rects | audit 0 high; `tests/scene-validation.test.ts` scatter tests |
| 2 | Hedge borders crossing plots | `plantingBeds()` / `flowerBeds()` subtract plot rects; borders, shrub border and scatter read the clipped beds | bed-clipping tests (zero overlap area, clipped area < authored area) |
| 3 | Pavilion off the deck | `SITE.pavilion` = `(0, −8.7)`, 11 × 4.2 m, inside `lagoon.radiusZ + deck` | audit 0 medium (was medium) |
| 4 | Lamp inside a plot / on the carriageway | `lampPositions(exclude)` + junction skip; renderer and validator share the call | audit 0 low; lamp test (off road, outside plots) |
| 5 | Driveway rule declared but unenforced | `drivewayFor()` walked per plot; critical when unreachable > 30 m, medium > 24 m, high when the ribbon crosses a neighbour | audit 0; validator fires on a deliberately broken scene |
| 6 | Plot geometry duplicated inside a 1114-line component | plots described once in `parts.ts`, merged per material in `plot-geometry.ts`, drawn by `Plot.tsx` | `tsc`, build, 674 parts → 164 draw calls |

---

## 5. Spatial rules now enforced

`SPATIAL_RULES` in `src/lib/3d/validate.ts` is the machine-readable list; the validator implements
each one.

1. A house footprint never intersects a carriageway, another house or the perimeter. *(critical)*
2. Every house reaches the road network with a driveway shorter than 24 m. *(critical / medium)*
3. Plot walls, carports and pools stay inside the perimeter fence. *(high)*
4. A plot never intrudes on a neighbouring plot's house. *(high)*
5. Pool furniture sits on the pool deck; canopies may overhang if they clear the walls. *(medium)*
6. Vegetation lives only in planting beds — never inside a plot, on a road, on a court or on the
   lagoon deck. *(high / medium)*
7. Sports courts are disjoint, inside the perimeter and clear of every house. *(critical)*
8. Street lamps stand beside the carriageway, never on it and never inside a plot. *(low)*

Intentional intersections are deliberately **not** reported: a carport in the front setback (outside
the walled garden, off the road), a parasol canopy overhanging the deck, walls that abut rather than
overlap, and planting that overhangs a fence without entering a plot.

---

## 6. Structural changes

| Area | Before | After |
| --- | --- | --- |
| `SiteScene.tsx` | 1114 lines, inline `Plot`, `Pool`, `Garage`, `Car`, `Lounger`, `Parasol`, `Planter`, `Wall`, roads, beds, lamps, lighting | 169 lines: props, two placement memos, JSX composition |
| Plot geometry | JSX per primitive inside the scene | data (`parts.ts`) → merged meshes (`plot-geometry.ts`) |
| Placement rules | implicit in each component | `lib/3d/site.ts` (+ `plotFootprint`, `plantingBeds`, `drivewayFor`, `lampPositions(exclude)`) |
| Validation | none | `lib/3d/validate.ts` + `scripts/scene-audit.ts` |
| Tests | 58 | 76 (+18 for the validation layer) |
| Plan renderer | own scatter call | same exclusion list as the viewer |

The renderer keeps one merge cache keyed by plot identity, bounded to 32 entries, disposing the
oldest geometry — so toggling day/night or low/high quality does not leak GPU memory.

---

## 7. Verification performed

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | pass, 0 errors |
| Lint | `npm run lint` | 0 errors, 7 pre-existing warnings |
| Tests | `npx vitest run` | **76/76 pass (7 files)** |
| Spatial audit | `npx tsx scripts/scene-audit.ts` | 0 critical / 0 high / 0 medium / 0 low |
| Data smoke | `npm run smoke` | all checks pass |
| Production build | `npm run build` | pass |
| Plan render | `npx tsx scripts/render-plan.ts docs/masterplan.png` | 744 × 640, 96 trees |

The validator is tested both ways: it passes the shipped scene, and it **fails** deliberately broken
ones (house on the ring road → critical; duplicate house → critical; house outside the fence →
critical), plus unit tests for rotation-aware part bounds, unique part ids, carport/car clearance
from the carriageway, lamp placement and bed clipping.

### Not verified (no browser, no GPU in this environment)

- No screenshot or frame-time measurement of the 3D view. **No FPS number is claimed.**
- Draw calls and triangles in this document are **computed from scene data**, not read from a GPU
  profiler or WebGL inspector.
- Route rendering was not re-checked with a live browser this round; the build and the smoke suite
  were.
- Day/night appearance, materials and lighting balance were not visually re-inspected.

---

## 8. Performance observations

Measured by counting, not by profiling:

- Plot primitives: **674** across 13 plots (≈52/plot). Rendered one mesh per primitive that would be
  674 draw calls; merged by material it is **164** (12.6/plot) — a **4.1× reduction**, with 12,760
  triangles.
- Vegetation stays instanced: trunks and four canopy kinds are `InstancedMesh` (one draw call each),
  shrubs and flowers likewise. Counts: 96 trees / 64 shrubs / 307 flowers at full quality, 54 / 30 /
  90 at low quality. The tree count was reduced on request and is not being raised.
- Lamps: only every sixth lamp carries a `pointLight` at night, and none at low quality; the rest are
  emissive meshes.
- Geometry is cached per plot and shares materials across the whole scene (`materials.ts`), so
  toggling quality re-uses or evicts deterministically instead of rebuilding unbounded.

---

## 9. Limitations

- The scene is still procedural. Photoreal fidelity is bounded by primitive geometry and by
  `materials.ts`; no PBR texture set or HDRI is used beyond a generated environment.
- `house-geometry.ts` still bakes some planting and hedges into the house geometry buckets. Those
  instances are **not** covered by the plot exclusion rules and were not verified this round.
- The validator is 2D. It reasons about footprints, clearances and ground contact — not about
  sightlines, roof intersections above ground level, or material seams.
- Everything the validator reports is geometry-derived (`confirmed: true`). There is no
  needs-visual-review channel yet, because there is no way to look at a frame from here.

## 10. Next improvements

1. Move the baked house planting out of `house-geometry.ts` into the same part/placement system, so
   the validator covers every plant in the scene.
2. Add vertical rule checks: roof/facade intersections between neighbours, canopies over walls,
   window-vs-fence sightlines.
3. Give `Finding` a `needsVisualReview` path and a small report UI in the admin, so a human can
   triage what geometry cannot decide.
4. Wire `npx tsx scripts/scene-audit.ts --strict` into `npm run check` once the finding count is
   stable at zero.
5. Measure real GPU cost (draw calls, frame time) in a browser session and replace the computed
   budget numbers above with observed ones.
