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
scene: 13 houses · 13 plots · 8 pools · 13 carports · 726 parts
findings: 0 critical, 0 high, 0 medium, 0 low
budget: plots 208 draw calls (16.0/plot) · 15,568 triangles · 54 trees · 307 flowers
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
| 6 | Plot geometry duplicated inside a 1114-line component | plots described once in `parts.ts`, merged per material in `plot-geometry.ts`, drawn by `Plot.tsx` | `tsc`, build |
| 7 | Vegetation baked into the house mesh (see §11) | house geometry carries no plants; garden planting is plot data with clearance rules | validator rules, 4 garden-planting tests |

---

## 5. Spatial rules now enforced

`SPATIAL_RULES` in `src/lib/3d/validate.ts` is the machine-readable list; the validator implements
each one.

0. No object belonging to a plot may occupy the volume of its own house. *(high)*
1. A house footprint never intersects a carriageway, another house or the perimeter. *(critical)*
2. Every house reaches the road network with a driveway shorter than 24 m. *(critical / medium)*
3. Plot walls, carports and pools stay inside the perimeter fence. *(high)*
4. A plot never intrudes on a neighbouring plot's house. *(high)*
5. Pool furniture sits on the pool deck; canopies may overhang if they clear the walls. *(medium)*
6. Vegetation lives only in planting beds — never inside a plot, on a road, on a court or on the
   lagoon deck. *(high / medium)*
6b. Garden planting stays inside its own plot, clear of the pool water and deck. *(high)*
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

---

## 11. Second pass — the source of the vegetation defects

After the first pass the audit was clean, but a class of defect was simply *outside* its reach: the
house mesh carried its own vegetation, so the rules could not see it.

### 11.1 What was wrong

`house-geometry.ts` baked 3 trees and 2 hedges into every house at fixed offsets from the façade.
Measured against the plot geometry that the renderer actually draws:

| Object | Offset used | Where it landed |
| --- | --- | --- |
| 3 trees per house | `x = ±(W + 2.4 … 5.9)` | wall inner face is at `W + 1.55` → trees start **0.85 m outside** the boundary wall, canopy crossing into the neighbour's garden |
| side hedge | `x = W + 2.0`, 0.7 wide | straddles the boundary wall (5.25 – 5.95 m against a wall at 5.30 m) |
| rear hedge | `z = −(D + 3.2)` | on pool plots this is **inside the pool deck and water**, which begins at `−(D + 0.8)` |

Thirteen houses × (3 trees + 2 hedges) = 65 objects that no rule could check, sitting across walls
and in pools.

### 11.2 The correction

- `house-geometry.ts` no longer plants anything; `addPlanting`, the PRNG that only it used and its
  five geometry keys are gone.
- Garden planting is now part of the plot (`gardenParts` in `lib/3d/parts.ts`), measured from the
  plot itself: rear hedge inset by the wall thickness, two 2 m-canopy trees in the rear band behind
  the pool deck, and *nothing* when the band is too shallow to take a plant honestly.
- Three validator rules make the class of defect checkable: planting outside its plot *(high)*,
  planting over a pool deck *(high)*, any part inside its own house *(high)*.

Net effect: **65 untyped objects in the house mesh → 39 rule-checked parts in the plots**, with the
audit covering all of them.

### 11.3 The validator earned its keep

The first implementation of `gardenParts` had a sign error on Z and put the trees 1 m beyond the
rear wall. `npm run audit:3d` caught it immediately (`H04/planting/tree-east/canopy crosses the
perimeter fence`, medium) before any of it reached a browser. That is the argument for rules over
screenshots: this defect would have been nearly invisible in a wide shot and obvious only from the
neighbour's garden.

### 11.4 Product surfaces added

The validator was a CLI. It is now three things:

| Surface | What it does |
| --- | --- |
| `npm run audit:3d` | `--strict` gate, wired into `npm run check`: a critical or high finding fails the build |
| `/admin/scene` — *Scene health* | the published scene checked server-side: severity counts, every finding with its footprint and correction, the rule list, and the scene budget |
| 3D editor | the draft is re-validated while a house is dragged (160 ms debounce); a conflicting house turns red with a ring, and the strip under the viewport names up to three blocking objects with a link to select them |
| Viewer — *Perf* | the renderer's own numbers, measured in the browser: FPS, frame time, draw calls, triangles, geometries, textures, programs, quality and light mode |

The performance panel exists precisely because the numbers in §8 are counted from data, not
measured. With it, anyone can check them on their own device.

### 11.5 Verification after the second pass

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | pass |
| Lint | `npm run lint` | 0 errors, 7 pre-existing warnings |
| Tests | `npx vitest run` | **87/87 pass (8 files)** |
| Spatial audit | `npm run audit:3d` | 0 / 0 / 0 / 0, strict exit 0 |
| Admin route | HTTP with a real session cookie | `/admin/scene` → 200; without a cookie → 307 to `/login` |
| Public route | HTTP | `/` → 200, perf panel present in the client chunk |
| Build | `npm run build` | pass |
| Geometry | `tests/plot-geometry.test.ts` | merged meshes non-empty, finite, inside the plot envelope, cached |

Still not verifiable here: no frame was rendered by a GPU in this environment, so the *visual*
result of the new garden planting, the red conflict tint and the perf panel itself remain
**unverified by eye**. What is verified is that the geometry they draw is correct, bounded and
rule-compliant.

### 11.6 Known gap that remains

`/admin/scene` audits the published scene. The editor audits the draft. They agree because they call
the same function — but nothing yet prevents publishing a draft with blocking findings: the editor
warns and tints, it does not refuse. That is a deliberate product decision (a manager may publish a
deliberate exception); if it should become a hard gate, the check belongs in `publishSceneAction`,
where the same `validateScene` call is already available.

---

## 12. The lagoon

The lagoon was the weakest object in the scene: a flat ellipse of stone, a flat
ellipse of water, four boxes as steps and a pavilion with no interior. It is also
the one object every visitor looks at first, because the road rings it.

### 12.1 Rebuilt as data

`src/lib/3d/lagoon.ts` now describes the whole feature as parts, on the same
contract as the private plots:

| Element | Full quality | Performance | Rule it obeys |
| --- | --- | --- | --- |
| Stone coping | 72 segments | 36 | sits in the 0.34 m band outside the water |
| Timber boardwalk | 26 planks | 14 | east arc, inside the paving edge |
| Steps and handrails | 4 + 4 | 4 + 4 | the only structure allowed over the water |
| Bollards | 8 posts + heads | 6 | outer ring, pavilion and steps arcs kept clear |
| Pavilion | 41 parts | 30 | slab, floor, four posts, beams, rafters, bar, 3 stools, bench, 2 lanterns |
| Loungers / tables / parasols | 6 / 3 / 2 | 3 / 2 / 1 | west deck, facing the water |
| Reeds, lilies, rim rocks, planters | 33 + 6 + 4 + 4 | 33 + 0 + 4 + 4 | reeds and lilies in the water, the rest on the coping |

**235 parts merged into 12 draw calls at full quality** (11 at performance
quality), one mesh per material. The deck detail alone — coping, planks,
rafters — is over a hundred primitives that would otherwise be a hundred draw
calls.

### 12.2 Two bugs found by building it

**Rotation order.** `partBounds` composed euler rotations as `RZ·RY·RX` while
three.js composes `RX·RY·RZ`. For axis-aligned pieces the two agree, which is why
nothing had noticed; the first tilted piece (a lounger backrest) exposed it.
Every bound the validator had ever computed for a rotated part was slightly
wrong. Fixed and pinned against three.js in `tests/plot-geometry.test.ts`.

**Deck ring model.** The deck is drawn as an ellipse with semi-axes
`(rx + deck, rz + deck)`, but placements were computed by scaling both water
radii by a single factor — a different, narrower curve. Furniture placed that way
drifts off the paving at the ends of the ellipse. The ring is now parametrised by
distance across the deck (`t`), and `insideDeckEllipse()` is the single predicate
the renderer, the validator and the plan share.

Both were caught by the new lagoon rules before anything was rendered — the
run went from `19 high, 1 medium` to `0` as the geometry was corrected, not as
findings were suppressed.

### 12.3 Water

The surface is built in two zones, because one sheet cannot do both jobs:

- **Deep centre** (86% of the radius): `MeshReflectorMaterial` — it mirrors the
  pavilion, the tree line and the sky. Full quality only; performance mode keeps
  a single translucent sheet and no second render pass.
- **Shallow rim**: transparent water over a lighter tiled shelf, so the mosaic,
  the submerged steps and the lilies stay visible.

The basin was deepened to 0.62 m with a visible shelf, the water sits *below* the
coping instead of above the paving, and night adds an underwater light, a rim
glow, a warm pavilion light and per-bollard pools of light.

### 12.4 Rules added

4. Lagoon furniture and lighting stand on the deck ring: outside the water,
   inside the paving. *(high / medium)*
5. Only the steps enter the basin; the pavilion and boardwalk stay on the deck. *(high)*
6. Reeds and lilies grow in the water; planters and rim rocks stay on the coping. *(low / medium)*

`validateScene` takes an optional `lagoon` layout generator, so tests can prove
these fire: a lounger in the water, a jetty built over the basin and a bollard
pushed past the paving are each covered.

### 12.5 Verification

| Gate | Result |
| --- | --- |
| `npx vitest run` | 104/104 (9 files; +15 lagoon, +2 bounds) |
| `npm run audit:3d` | 0 critical / 0 high / 0 medium / 0 low · lagoon 134 parts → 11 draw calls (performance layout) |
| Plan | `docs/masterplan.png` now draws the boardwalk, steps, bollards and the pavilion roof line |

**Not verified:** the reflection has not been seen — there is no GPU here. The
reflector is gated behind full quality precisely so that a device that dislikes
it can switch to performance mode without losing the feature. This is the one
change in this round that genuinely needs a human eye before it is called
finished.

## 13. Pedestrian circulation

The site had carriageways, driveways and kerbs but **no pedestrian network at
all**: nothing was drawn between the gate and a front door, and nothing checked
that one existed. A house could be unreachable and every gate would stay green.

### 13.1 The network is derived, not drawn by hand

`src/lib/3d/circulation.ts` builds the network from the same `SITE` numbers the
roads use, so plan, renderer and validator cannot drift:

| Element | Rule |
| --- | --- |
| `path/ring-outer` | Closed loop on the **outer** verge, `PATH.ringInset` outside `SITE.ring.outer` — the houses front the circuit from outside, so this is the spine that serves them |
| `path/ring-inner` | Closed loop on the **inner** verge, `PATH.ringInset` inside `SITE.ring.inner`, around the central garden |
| `path/crossing/{east,west}` | Marked crossings over the circuit at `z = 0`, joining spine and garden |
| `path/crossing/north` | The arrival axis: the boulevard lands at `x = 0`, so the garden is entered straight ahead from the gate |
| `path/boulevard/{east,west}` | Verge walks from the gate to the junction |
| `path/lagoon`, `path/service`, `path/sports` | Deck loop, service-road verge, link to the sports park |
| `path/spur/<code>` | Door → front garden → nearest spine point **on the façade side** |

Three defects found and fixed while building it, each structural rather than a
coordinate nudge:

1. **The loop was four arcs.** `roundedLoop` emitted the corner arcs and never
   the straight sides, so the "closed loop" was four disconnected quarter
   circles and every crossing landed in the void between corners.
2. **The ring did not close.** The last straight excluded its end sample, leaving
   a ~2 m gap wider than the join radius `PATH.joinRadius`.
3. **Junctions joined by luck.** A verge ending 1.5 m from the loop connected on
   one side of the site and not the other, silently sending the east half the
   long way round (273 m instead of 109 m). `snapEndpoints` now makes shared
   endpoints coincide exactly, in a fixed order: rings first, then the paths that
   meet them.

A fourth correction is about honesty: `splitRoadCrossings` used to relabel **any**
run over tarmac as a "crossing". A path that follows the carriageway was
therefore invisible to the rule that forbids it. Now only a run shorter than
`PATH.maxCrossing` becomes a crossing; a longer one keeps its authored kind and
is reported.

### 13.2 Rules

| Rule | Severity |
| --- | --- |
| Every front door reachable on foot from the gate | **critical** |
| No footpath inside a house footprint | **critical** |
| Footpath clear of carriageways except at a marked crossing | high |
| Public path never crosses a private plot | medium |
| Width: ≥ 1.2 m walk, ≥ 2 m crossing | medium |
| Spur shorter than 14 m, always on the façade side | test |

A door only counts as served when a sampled path node is within
`PATH.doorLink` (3.5 m); the graph refuses to connect a door to a path that is
not actually there.

### 13.3 Measured

```
paths 30 (ring 4 · crossing 8 · spur 13 · boulevard 2 · lagoon 1 · service 1 · sports 1)
nodes 602 · edges 776 · 942 m of footpath
unreachable 0/13 · worst walk gate → door 197.2 m (H03)
H01 165 · H02 181 · H03 197 · H04 185 · H05 163 · H06 147 · H07 127
H08 109 · H09 54 · H10 71 · H11 69 · H12 87 · H13 98
```

Render: one merged ribbon mesh for walks and one for crossings (mitred joins, so
no notches at corners) — **2 draw calls** for the whole network. The plan draws
the same polylines in `docs/masterplan.png`.

### 13.4 One conflict left open, on purpose

`path/ring-outer` clips the north-west corner of **H13's plot** at five sample
points. The plot wall leaves 1.85 m between itself and the kerb; the footpath
needs 2.2 m plus clearance. There is no room, and the two ways out of it both
change something that is not mine to change alone:

- set H13's plot back ~1.0 m (moves approved architecture), or
- narrow the verge path to 1.8 m through that frontage (a visible pinch point).

It is reported as **medium** with the suggestion attached, pinned by a test, and
listed in the round report as a decision for the client. Hiding it — pushing the
path onto the kerb and relabelling it a crossing — was tried and reverted: the
screenshot got cleaner and the site got worse.

### 13.5 Verification

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `npx vitest run` | 123/123 (10 files; +19 circulation, incl. 5 negative) |
| `npm run audit:3d` (strict) | 0 critical / 0 high / **1 medium** (H13 corridor) / 0 low · exit 0 |
| `npm run build` | `/` 496 kB (+12 kB for the network) · `/admin/3d-editor` 398 kB |
| Plan | `docs/masterplan.png` draws the whole network |

**Not verified:** the 3D ribbons have not been seen rendered — there is no GPU
in this environment. The geometry is checked numerically (closed rings, no
samples inside houses, widths, joins), not visually.

## 14. The lagoon had no water

Reported from the live viewer: *"put water in the middle of the lagoon"*. The water
was there in data (`LAGOON_WATER`, y = 0.02, basin at −0.62) and in the plan, but
invisible in 3D, because two opaque layers sat above it:

| Mesh | Height | Shape |
| --- | --- | --- |
| Water | y = 0.02 | ellipse 16 × 10.2 |
| Grass verge (`Roads.tsx`) | y = 0.03 | **filled circle**, r = 23.4 |
| Deck paving (`Lagoon.tsx`) | y = 0.08 | **filled ellipse**, 21 × 15.2 |

Both were drawn as complete discs, so the lagoon rendered as a stone plate with a
green collar. Depth testing did the rest — no water, at any quality setting.

**Fix at the cause, not by nudging heights.** Paving is an annulus whose aperture
*is* the water ellipse:

- `deckPavingGeometry()` — elliptical ring from `(rx + deck, rz + deck)` down to `(rx, rz)`.
- `lagoonVergeGeometry()` — elliptical ring from the deck edge out to `+margin`.

A uniform `RingGeometry` scaled per axis would not work: it gives an annulus of
*proportional* thickness (5 m on X becomes 3.6 m on Z) and the aperture stops
matching the water on the short axis. A `THREE.Shape` with an elliptical hole is
exact.

**Verified without a GPU.** `tests/lagoon-surface.test.ts` casts rays straight down
through the three surfaces:

```
topSurfaceY(0, 0)              → 0.02  water
topSurfaceY(±0.8·rx, ±0.8·rz)  → 0.02  water, all over the basin
topSurfaceY(rx + deck/2, 0)    → 0.08  stone on the deck band
topSurfaceY(rx + deck + 1.2,0) → 0.03  grass on the verge
topSurfaceY(rx ± 0.2, 0)       → 0.02 / 0.08  aperture exactly at the rim
```

Data untouched: `lagoon: 134 parts → 11 draw calls`, findings still 0/0/1/0, and
the lagoon rules (`insideDeckEllipse`, `onDeckRing`) are unchanged. What changed
is only how the paved band is triangulated.

## 15. The lagoon becomes a pool

Client decision: *"instead of paved, it should be a swimming pool"* — same
position, same dimensions, deck unchanged (5 m). The previous round stopped the
paving from covering the water; this round changes what the water *is*.

### 15.1 What was wrong

| Element | Before | After |
| --- | --- | --- |
| Programme | Landscape lagoon | Swimming pool |
| Reeds | 4 clusters, up to 9 stems each, standing in the basin | removed |
| Lily pads | 6 floating discs | removed |
| Rim rocks | 4 boulders on the coping | removed |
| Basin | Mosaic wall, tiled floor, shallow shelf | unchanged — already tiled |
| Deck | 5 m paving, loungers, parasols, pavilion, boardwalk | unchanged |
| Steps | Four wide steps with handrails into the water | unchanged |

Aquatic planting is not a detail that can sit next to a pool: reeds inside a
chlorinated basin are a contradiction, and they were the main visual cue saying
"pond". They were deleted from the data generator, not hidden — the validator has
no exemption left for them.

### 15.2 Rules

The lagoon rules were rewritten around the pool programme:

- The basin holds **water and swimmers only**: no planting, furniture or
  structure inside the water ellipse; deck planting stays on the coping. *(high)*
- Only the steps may enter the basin. *(high)*
- Deck furniture and lighting stay on the deck ring. *(medium)*
- The old rule "reeds and lilies grow in the water" is gone: there is nothing
  left to grow.

`POOL` in `lib/3d/lagoon.ts` now carries `programme: "swimming-pool"` and a
`depth` **derived** from the basin data, so the render, the rules and the tests
read the same number instead of a comment.

### 15.3 Measured

```
lagoon: 127 parts → 9 draw calls   (was 134 / 11: reeds, lilies and rocks removed)
findings: 0 critical · 0 high · 1 medium · 0 low   (the medium is H13, unchanged)
tests: 153/153 across 14 files (+1 net: two water-plant tests replaced by two pool tests)
build: compiled successfully
```

### 15.4 Known limitation, recorded not hidden

The basin was cut for a landscape lagoon: **0.64 m** from floor to waterline.
That is paddling depth; a swimming pool is 1.2–1.8 m. Deepening it means
re-cutting the basin, the shelf and the step run — approved geometry, and a
change that should be authorised, not slipped in under a rendering request. The
pool reads correctly from every view (clean tiled water, no planting, waterline
against stone), but a swimmer would notice. `POOL.depth` exposes the number so
the decision can be made explicitly.

The element keeps its `SITE.lagoon` identifier: that key is shared by the plan,
the rules, the editor and the viewer, and renaming it is repository-wide churn
with no spatial benefit. Public copy now says "pool".

## 16. Architectural presence of the houses

### 16.1 Audit — what was actually wrong

Read from `house-geometry.ts` (the single builder for all four typologies) and
confirmed against the built vertex bounds, not against intent:

| # | Defect | Evidence |
| --- | --- | --- |
| A | Canopy posts did not reach the canopy | Post centre `y = 1.09`, height `2.68` → spans **−0.25 … 2.43**; the canopy slab is at **2.73**. A 30 cm gap, and the post started 25 cm underground. |
| B | The roof was a floating lid | One slab, **1.00–1.10 m** overhang, 0.34 m thick, no fascia and no soffit. The shadows it cast made the walls look unfinished. |
| C | The house was pasted on the ground | A 0.16 m slab at `y = 0.02` → **8 cm** of visible base, no projection. |
| D | Joinery had no sills or heads | The sill expression ended in dead code `+ (isH ? 0 : 0)`, appeared only above 0.5 m, and no head drip existed. |
| E | Glass was a black mirror | `metalness 0.92`, `opacity 0.62`, and **nothing behind it**. Walls are built with real holes, so every window showed the sky through the house. |
| F | Chimney was a plain box | No cap, top 0.98 m above the roof. |
| G | Storeys read as one extrusion | No reveal where the upper volume meets the terrace slab. |
| H | Terraces dissolved into the lawn | A 0.14 m slab with no edge band. |
| I | **Cameras framed the north row from behind** | The rig derived its direction from the house's *absolute coordinates*. For H01 it placed the camera at **inFront = −10.3 m** — 10.3 m behind the facade, looking at the rear wall. |
| J | The editor used a different site | `SceneEditor` carried its own footprint table (7.6 × 9.2 …) that disagreed with `getFloorPlan` on **all four** typologies (7.2 × 10.4 …). |

Defects I and J were found by the new tests, not by inspection.

### 16.2 Changes

One constant block, `HOUSE_DETAIL`, owns every presentation dimension; wall
footprints, storey heights and plans are untouched.

- **Roof** — rebuilt as fascia + field + soffit + drip. Overhang 0.55 m (was 1.0),
  fascia 0.26 m (taller than the 0.2 m field, so the edge reads as an arris),
  soffit 5.5 cm under the overhang. The chimney now starts below the field and
  ends with a cap that oversails it.
- **Plinth** — 0.22 m high, standing 8 cm proud of the wall: the house meets the
  ground through a base.
- **Joinery** — sills project 11 cm past the face on both axes (dead code
  removed), a 5 cm head drip caps every opening, and an **interior backdrop**
  sits 24 cm behind the glazing, lifted so full-height glazing cannot carry it
  below grade.
- **Glass** — `metalness 0.12`, `roughness 0.045`, `opacity 0.5`,
  `envMapIntensity 2.1`: dielectric glass that reflects the environment
  lightformers instead of swallowing the light.
- **Storeys** — a 5 cm reveal under the upper volume; balcony slabs get a soffit;
  terraces get an edge band; the entrance keeps its canopy and gains a flush
  threshold apron (floor and grade are both at y = 0, so a step would bury it).
- **Framing** — new `lib/3d/framing.ts`: pure functions computing six named views
  (hero, three-quarter, facade, aerial, detail, context) from the house's real
  footprint, its real height and its **facing**. Distance solves the camera's
  half-angles, so a wide house never overflows the frame, and the eye height
  follows the volume. The rig now consumes it.
- **Editor** — footprints derived from `getFloorPlan` + `HOUSE_CONFIG`.

### 16.3 Visual evidence

`docs/houses-before-after.png` (front) and
`docs/houses-before-after-three-quarter.png` are real renders of the merged
geometry: `scripts/render-elevations.ts` pulls the **previous builder from git**,
builds both versions, and rasterises them with an orthographic camera and flat
shading. Before/after, all four typologies, same camera.

What the images show: the roof now has an edge and a shadow line instead of
hovering; the plinth connects the walls to grade; sills and heads give the
openings a frame; the chimney is a rendered shaft with a cap; the windows have
depth instead of reading as flat panels.

**What they are not:** beauty renders. No GPU exists in this environment, so
there is no PBR, no shadows, no reflections — and no claim of visual approval.

### 16.4 Measured cost

```
per house : +1 draw call (the interior plane), +621 triangles
4 prototypes: 42 → 46 draw calls, 11,680 → 14,164 triangles
13 houses : +13 draw calls, ~8.1k triangles in total
```

Measured by `scripts/measure-houses.ts`, which builds the current code and the
previous commit side by side.

### 16.5 Verification

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `npx vitest run` | **235/235** (16 files; +82: 35 geometry, 47 framing) |
| `npm run audit:3d` | 0 critical / 0 high / 1 medium (H13) / 0 low |
| `npm run lint` | clean |
| `npm run build` | compiled successfully |

Every typology is tested, not one demo house: no bucket below grade, plinth
contact, overhang within 0.4–0.8 m, ridge height consistent with the storeys,
glazing within 30 cm of the wall plane, an interior plane behind every window,
metal starting at grade (the canopy posts), and the approved plan dimensions
unchanged.

### 16.6 Still open

- **Textures, not materials, at close range.** The PBR parameters are coherent
  and shared, but there are no normal maps and no triplanar mapping: walk up to
  a wall and the plaster is flat. This is the next visual step.
- **Lighting presets** are unchanged (day/night only). Golden hour and blue hour
  are not implemented, so no material response has been judged under them.
- **The commercial panel** on selection still shows the old copy; the premium
  presentation pass was not attempted in this round.
- **Not verified in a browser.** Framing is tested geometrically (camera in
  front, outside the footprint, roof inside the frame) and elevations are
  rendered offline; the WebGL result itself has not been seen.

## 17. Os carros nos alpendres

### 17.1 O que estava mal

O carro era **cinco caixas**: chassi, ombro, cabine de vidro, tejadilho e quatro
cilindros. Lia-se como uma furgoneta — e pior, o merge por material fechava o
volume, pelo que os faróis colocados dentro do corpo nunca apareciam.

Foi ainda encontrado um defeito de medição: `partTriangleBudget` não tinha caso
para `loft` (a primitiva nova), pelo que os cascos dos carros custavam **zero**
triângulos no `audit:3d`. O orçamento estava a subestimar a cena em silêncio.

### 17.2 O que mudou

**Primitiva nova — `loft`.** Um corpo de carro não é uma caixa: é uma pilha de
secções varridas ao longo do comprimento. `src/components/three/site/loft-geometry.ts`
gera um casco fechado a partir de secções de superelipse (expoente ~4: lados
planos, ombros suaves), com:

- **tumblehome** — `topHalfWidth` fecha a secção em direcção ao tejadilho, senão a
  cabine vira um domo;
- normais suaves por anel, tampas com vértices próprios para a silhueta ficar viva;
- UVs, sem as quais `mergeGeometries` devolve `null` e o carro desaparece **sem
  erro** — exactamente o tipo de falha silenciosa que o protocolo proíbe.

**Dois corpos** (`src/lib/3d/car.ts`): um coupé fastback baixo para os T1/T2 e um
quatro-portas alto para os T3/T4 (que têm alpendre duplo). Proporções de referência:
capô longo, cabine recuada, balanços curtos, ombros largos, rodas a encher os
passos. 4,55 × 1,86 × 1,32 m e 4,80 × 1,90 × 1,60 m — dentro da baía de 3,6 m e
dos 2,9 m entre os dois carros do alpendre duplo.

**Acessórios medidos contra a carroçaria local.** Cada grelha, farol, espelho,
spoiler e saída de escape lê a secção do corpo **no seu próprio z**
(`bodyAt`), nunca a largura máxima do carro. Foi o erro da primeira tentativa:
peças dimensionadas pelo ponto mais largo flutuavam à frente do nariz afilado e
acima da cauda descendente.

**Assentamento:** a base da cabine é derivada do topo da carroçaria
(`max(bottom, body.top + 8 mm)`); um vidro que mergulha no casco deixa a pintura
ver-se através dele e cria uma cunha escura no flanco.

**Rodas:** o flanco do pneu é a peça mais saliente; jante, raios e cubo ficam
recesseados. Uma peça a sobressair do painel transforma-se numa barbatana assim
que o casco é fechado. Cinco raios, não 18 segmentos de raios.

**Ajuste uniforme:** quando a baía é mais curta do que o corpo, o carro encolhe
`fit` em todos os eixos. O código anterior escalava só Z e transformava as rodas
em elipses.

### 17.3 Prova

`scripts/render-cars.ts` rasteriza a geometria real, pelo mesmo
`mergePartsByMaterial` que o browser usa, com câmara em perspectiva e Gouraud:

- `docs/cars-before-after.png` — antes (5 caixas) e depois, por tipo;
- `docs/cars-before-after-views.png` — frente 3/4, lateral e traseira 3/4.

**Limitação declarada:** o rasterizador ordena triângulos por centróide. Em
superfícies quase coplanares — a jante contra o pneu, o painel lateral contra o
vidro — isso produz serrilha que o three.js **não** tem (tem z-buffer). Os testes
verificam numericamente o que a imagem não consegue provar: o pneu é a peça mais
exterior, a jante e os raios estão dentro dele, e nada desce abaixo da cota.

### 17.4 Custo medido

```
plots 213 draw calls (16.4/plot, era 16.0) · 46 208 triângulos (era 15 568)
```

O aumento é dos cascos: ~2,4 mil triângulos por carro, 13 casas com 1–2 carros.
Os materiais são os que já existiam (`carPaint0–2`, `carGlass`, `charcoal`,
`metal`, `white`), por isso o número de draw calls por lote mal mexe: +5 no total.

### 17.5 Verificação

| Gate | Resultado |
| --- | --- |
| `tsc --noEmit` | limpo |
| `npx vitest run` | **253/253** (17 ficheiros; +18 em `tests/car-geometry.test.ts`) |
| `npm run audit:3d` | 0 critical / 0 high / 1 medium (H13) / 0 low |
| `npm run lint` | limpo |

O teste novo fixa exactamente as falhas que a vista não apanha: enrolamento do
casco (volume assinado **positivo** — invertido, o `FrontSide` mostra o interior
do carro), atributos obrigatórios no merge, cabine assente em cada estação, nada
abaixo da cota, rodas redondas sob escala, simetria na baía e contagem de
triângulos do loft.

### 17.6 Não feito

- **Não são modelos de um carro específico.** Sem marca, sem matrícula, sem
  logótipo: são props representativos. As imagens de referência que recebi
  (Ferrari Purosangue, Mansory Pugnator, Roma, 12Cilindri) informaram
  proporções — não foram importadas, nem podiam: sem dependências pesadas e sem
  assets de terceiros.
- **Sem interiores, sem aberturas, sem faróis acesos.** Os vidros são opacos por
  desenho, para não se ver o vazio.
- **Não visto em WebGL.** Como no resto desta ronda.

## 18. Carros reais nos alpendres

### 18.1 Três modelos com cotas de fabricante

Os props genéricos foram substituídos por três automóveis que existem, modelados
a partir das **dimensões publicadas**. Não são importações: são geometria
procedural gerada pelo construtor do projecto.

| Modelo | Comprimento | Largura | Altura | Entre-eixos | Pneus |
| --- | --- | --- | --- | --- | --- |
| Ferrari Roma (2020) | 4,656 m | 1,974 m | 1,301 m | 2,670 m | 245/35 R20 · 285/35 R20 |
| Ferrari 12Cilindri (2024) | 4,733 m | 2,000 m | 1,292 m | 2,700 m | 275/35 R21 · 315/35 R21 |
| Ferrari Purosangue (2022) | 4,973 m | 2,028 m | 1,589 m | 3,018 m | 255/35 R22 · 315/30 R23 |

Os raios de roda são **calculados** a partir da medida do pneu (`aro × 25,4 +
2 × flanco`), não estimados: R20 → 0,340 m, R21 → 0,363 m, R22 → 0,369 m, R23 →
0,387 m. O Purosangue usa roda maior atrás, como o carro real.

### 18.2 O que distingue cada um

Não é a silhueta genérica com um autocolante: é a assinatura formal.

- **Roma** — nariz de tubarão com grelha larga de lâminas verticais na cor da
  carroçaria, faróis rasos sob o bordo do capô, fastback sem asa. Costas suaves.
- **12Cilindri** — viseira preta a toda a largura com os faróis dentro dela, lâmina
  DRL inferior, capô longo e baixo. É o carro mais baixo dos três (1,292 m) e o
  mais largo.
- **Purosangue** — cintura alta (1,13 m), cavas com aplicação de plástico preto,
  embaladeira preta, traseira **vertical** com queda abrupta do tejadilho e
  spoiler de tejadilho dividido. É o único com quatro portas.

A traseira do Purosangue foi corrigida a meio: a primeira versão caía em fastback
e lia-se como um coupé alto. Um quatro-portas não fecha em fastback.

### 18.3 Onde cada um estaciona

Alpendre simples (T1/T2): um Roma. Alpendre duplo (T3/T4): um Purosangue e um
12Cilindri. Encaixe uniforme quando a baía é mais curta do que o carro, para as
rodas continuarem redondas.

### 18.4 Defeito antigo encontrado por estes testes

`shapeExtents` calculava a caixa do `torus` com a espessura do tubo no eixo Y:
dava 1,55 m de largura a uma cava de roda de 0,9 m (2 × (r + tubo) = 2 × 0,9 =
1,8 m reais, mas distribuídos por eixos errados). O validador andava a medir uma
forma que o renderer não desenhava. Corrigido: o disco tem 2(r+T) em X e Y, e
só 2T em Z.

### 18.5 Custo medido

```
roma        58 peças · 1 928 triângulos
12cilindri  55 peças · 1 892 triângulos
purosangue  65 peças · 2 660 triângulos

plots 213 draw calls (16.4/plot) · 49 608 triângulos (pior quarteirão 5 148)
antes dos carros reais:                     46 208 triângulos
primitivas de cinco caixas:                 15 568 triângulos
```

O `audit:3d` passou a reportar **o pior quarteirão** e não só o total — uma média
esconde uma regressão localizada. Há teste a fixar o tecto em 6 000 triângulos
por quarteirão.

### 18.6 Verificação

| Gate | Resultado |
| --- | --- |
| `tsc --noEmit` | limpo |
| `npx vitest run` | **271/271** (17 ficheiros; 35 em `tests/car-geometry.test.ts`) |
| `npm run audit:3d` | 0 critical / 0 high / 1 medium (H13) / 0 low |
| `npm run lint` | limpo |
| servidor | `/`, `/properties`, `/login` a 200 |

Os testes novos prendem as cotas: cada modelo tem de reproduzir comprimento,
largura, altura e entre-eixos publicados; as rodas têm de estar à distância do
entre-eixos; cada carro tem de ter a sua assinatura frontal e **não** a dos
outros; só o Purosangue leva aplicação nas cavas; e o carro mais comprido tem de
caber na baía mais funda.

### 18.7 Limites honestos

- **Marcas, letras e matrículas não são reproduzidas.** A esta escala seriam
  detalhe inventado. O que identifica o carro é a forma.
- **Sem interiores, sem aberturas, vidros opacos.**
- **Sem verificação em WebGL.** As imagens vêm de um rasterizador CPU sobre a
  geometria real; o resultado no browser não foi visto. O que os testes provam é
  a geometria — dimensões, assentamento, simetria, assinatura.

## 19. Os residentes

### 19.1 Causa: não havia residentes

Antes desta ronda não existia **nenhum** código de habitantes. `grep -rli
"npc|agent|resident|habitante|population"` sobre `src/` devolvia zero
ocorrências de agentes: nada escondido, nada por montar, nada atrás de uma flag
falsa, nada a falhar a importação. A população simplesmente nunca foi escrita.
O que já existia — e que é reutilizado em vez de reinventado — era a rede
pedonal (`src/lib/3d/circulation.ts`) e o padrão de animação por `useFrame`.

### 19.2 O que foi construído

| Ficheiro | Papel |
| --- | --- |
| `src/lib/3d/residents.ts` | Simulação pura: grafo pedonal, criação, estados, rotas, encontros. Sem three.js, sem React. |
| `src/lib/3d/resident-skeleton.ts` | Esqueleto: onde assenta cada peça do corpo. Fonte única para o renderer e para o rasterizador. |
| `src/lib/3d/resident-store.ts` | Estatísticas ao vivo, 4 Hz, fora do ciclo de render. |
| `src/components/three/site/Residents.tsx` | Renderer: 10 `InstancedMesh`, matrizes escritas por frame. |
| `src/components/viewer/ResidentsPanel.tsx` | HUD de diagnóstico dentro do visualizador. |
| `scripts/render-residents.ts` | Rasterizador offline das mesmas transformações (sem browser). |
| `tests/residents.test.ts`, `tests/resident-body.test.ts` | 33 testes: movimento, conversas, colocação, anatomia, escala, instâncias. |

### 19.3 Criação e integração

`buildResidentWorld()` deriva o grafo de `footpaths()` — os nós são os pontos
reais das faixas, as arestas são segmentos consecutivos mais uniões até
`PATH.joinRadius` (1,2 m). **Os trilhos `spur` para as portas são excluídos**:
atravessam o jardim privado de cada casa, e um residente não entra num lote
alheio. O grupo "à porta" fica no caminho público mais próximo da entrada
(`entranceFor`).

`createResidentSim()` cria 20 pessoas: 6 a passear, 4 em dois pares de conversa,
3 junto às entradas, 3 em lazer, 2 acompanhadas, 2 independentes — sobreposições
resolvidas por espaçamento mínimo no arranque. Cada pessoa tem altura
(1,60–1,93 m), compleição, pele, cabelo, camisa e calças próprios.

O ciclo é `Idle → Walking → Pausing → Interacting → Walking`. A velocidade é
acelerada e travada (`accel` 1,7 / `decel` 2,9 m/s²), a rotação é limitada a
3,4 rad/s, o corpo vira para onde caminha, e há travagem quando outro corpo entra
no espaço pessoal (0,62 m). Um `dt` gigante (aba em segundo plano) é limitado a
0,1 s, pelo que ninguém salta.

`<Residents count={20} />` é montado em `SiteScene`, entre `Boundary` e as
`Plot` — dentro do grafo R3F que já existia, sem página de demonstração, sem
galeria, sem cena alternativa.

### 19.4 Conversas

Os quatro residentes de conversa têm par fixo (`buddy`). Cada reencontro escolhe
o **nó mais próximo do ponto médio** entre os dois e dá a cada um um lugar a
±0,58 m ao longo da tangente da faixa, para chegarem de frente um para o outro.
Ao chegar, esperam; quando ambos esperam, começa a conversa (9–24 s), com gestos
alternados nos braços. Depois retomam o passeio e voltam a encontrar-se. Se um
par não se encontrar em 60 s, o encontro é abandonado — esperar nunca é
permanente.

### 19.5 Diagnóstico

Botão **Residents** no visualizador (junto a Perf) abre um HUD com: criados,
adicionados à cena, visíveis no frustum, a caminhar, parados, a conversar,
conversas iniciadas/terminadas, falhas de navegação, estado da simulação, e o
residente selecionado — posição, estado, atividade, destino (nó e coordenadas) e
metros percorridos. Clicar num corpo seleciona-o; as setas ← → percorrem a
população; o ícone de reciclagem regenera; o de pausa suspende. A seleção é
desenhada com um anel no chão.

O HUD lê um snapshot publicado a 4 Hz por `useSyncExternalStore`. **Não há
`setState` por frame**, nem criação de geometria, material ou cor durante o
render.

### 19.6 Verificação

| Porta | Resultado |
| --- | --- |
| `tsc --noEmit` | limpo |
| `npx vitest run` | **304/304** (19 ficheiros; 33 novos) |
| `npm run audit:3d` | 0 critical / 0 high / 1 medium (H13, pré-existente) / 0 low |
| `npm run lint` | sem erros; só avisos pré-existentes |
| servidor | `/`, `/properties`, `/login` a 200 |
| chunk servido ao browser | `/_next/static/chunks/app/page.js` contém o código dos residentes |

Os testes provam, com a simulação real a correr minutos de tempo simulado:
- todos os 20 nascem **sobre a rede pedonal** (a menos de 0,3 m de uma aresta) e
  **fora de qualquer lote privado** — verificado em cada passo de 900 passos;
- todos se deslocam (> 3 m em 240 s cada) e nenhum sai da rede;
- ~2 conversas começam **e terminam** em 300 s; os pares ficam a 0,7–2,2 m,
  virados um para o outro (erro de orientação < 0,4 rad), com gestos;
- as pausas expiram: ninguém fica parado mais de um minuto fora de conversa;
- a mesma semente dá o mesmo resultado; sementes diferentes dão posições
  diferentes;
- o corpo tem 22 peças (11 grupos, 11 *draw calls* para 20 pessoas), 1,60–1,93 m
  do chão ao topo da cabeça, cabeça a 1/7–1/8 da altura, pés no chão, joelhos
  entre a anca e o tornozelo, nariz e olhos na face, mãos nas pontas dos
  antebraços e um pescoço curto entre a cabeça e os ombros;
- `navFailures === 0`.

### 19.7 Imagens

`docs/residents-overview.png` (20 pessoas sobre a rede, escala do loteamento),
`docs/residents-closeup.png` (um par a conversar, com postes de referência de
1,78 m e 2,70 m) e `docs/residents-head.png` (o rosto: olhos, nariz, cabelo —
geometria estática; **não há expressões faciais**).

`docs/residents-walking.png` (uma pessoa a meio passo, de perfil: perna de apoio
plantada, joelho de balanço fletido, braços em oposição) completa o conjunto.

`npx tsx scripts/render-residents.ts` regenera as quatro.

### 19.7.1 Marcha e articulação (ronda final)

- **Pernas:** `shinAngle = angle · 0,55 + swing · 0,7`, com `swing` só quando o
  estado é `walking`. O corpo desce `shift = baseY − lowestSole`, pelo que a sola
  de apoio fica **exatamente** em `RESIDENTS.groundY`; parada, `swing = 0` e
  ninguém flutua.
- **Braços e pernas aduzem/abduzem** por `lean` (rotação sobre o eixo da frente do
  corpo), não só para a frente: é isso que impede os braços de ficarem dentro do
  tronco. `limbAxis()` devolve a direção combinada `tilt`/`lean`/`yaw`; o
  rasterizador e o renderer usam-na.
- **Ombros:** uma segunda instância de `chest` dá a linha dos ombros, sem a qual o
  casaco era um ovo e os braços flutuavam ao lado.
- **Variação:** altura (1,60–1,93 m), largura de ombros, amplitude de passada,
  cinco tons de pele, cinco de cabelo, oito de camisa, cinco de calças e três
  estilos de cabelo (curto, comprido, calvo). **Geometria**, não expressão facial.

### 19.8 Limites honestos

- **Sem verificação em WebGL.** Não há Chromium neste ambiente (o CDN do
  Playwright está bloqueado: `ECONNRESET`). As imagens vêm de um rasterizador
  CPU que aplica **as mesmas** transformações de `resident-skeleton.ts`; não são
  capturas do browser. O que está provado é colocação, escala, articulação,
  cores e comportamento; o que **não** está provado é o trajeto WebGL, as sombras
  e o aspeto final no ecrã do visitante.
- **Sem expressões faciais, sem roupa articulada, sem cabelo animado.** Os corpos
  são formas primitivas compostas; a variedade vem de proporções, cabelo e cores.
  O rosto tem olhos e nariz estáticos e nada mais.
- **Trânsito automóvel: estático.** Os carros continuam estacionados nos
  alpendres (ronda `39f3dfc`); não há veículos em movimento, cruzamentos
  geridos nem manobras de estacionamento. A Fase 4 está, por isso, **parcial**.
- **Nenhum modelo externo é carregado.** Os corpos são geometria gerada no
  repositório; por isso o canal de "model-load errors" do HUD está vazio por
  construção, não por omissão.
- **Sem colisão física com os carros**, apenas com os edifícios (os lotes estão
  excluídos da rede) e com os outros corpos (travagem).
- **H13 continua a ser atravessada** pelo anel exterior (`path/ring-outer`), um
  achado médio pré-existente. A rede é usada tal como está; não foi corrigida em
  silêncio.

### 19.9 Medição da ronda final

`npx tsx scripts/probe-residents.ts 13` (13 min de cena, 15 Hz, 20 pessoas):

| métrica | valor |
| --- | --- |
| pior afastamento da rede pedonal | **0,50 m** |
| par mais próximo | **0,43 m** |
| maior troço a "andar sem sair do sítio" | **0,2 s** |
| recuperações de encravamento | **2** |
| conversas | **34 começadas / 34 terminadas** |
| reuniões inalcançáveis | **0** |
| falhas de navegação | **0** |

`npx tsx scripts/bench-residents.ts` (20 pessoas, 5 000 frames): passo da
simulação **0,063 ms**, corpos + matrizes **0,100 ms** por frame — **0,16 ms**
de CPU por frame, com as animações ligadas. Isto mede CPU, não GPU: os *draw
calls* (11) e as sombras não foram cronometrados num browser.
