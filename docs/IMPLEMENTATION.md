# HAVEN® — Implementation report

Status as delivered on this branch. Everything below was executed in this workspace unless it is
explicitly marked **unverified**.

## Verification performed

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript (strict) | `npx tsc --noEmit` | pass, 0 errors |
| Lint | `npm run lint` | pass, 0 errors (warnings only) |
| Unit tests | `npx vitest run` | 87/87 pass (8 files) |
| Data-layer smoke | `npx tsx scripts/smoke.ts` | 22/22 checks pass |
| Spatial audit | `npm run audit:3d` | 0 critical / 0 high / 0 medium / 0 low |
| Production build | `npm run build` | pass; 17 routes + middleware compiled |
| Public rendering | HTTP against `next dev` | `/`, `/properties`, `/properties/[slug]`, `/visit`, `/login` → 200 |
| Admin rendering | HTTP with a real session cookie | all 9 admin routes → 200 |
| Upload serving | HTTP | `/uploads/<file>` 200 with correct MIME; traversal and missing files → 404 |
| Password verification | scrypt round-trip against seeded admin | correct password true, wrong password false |
| Seed idempotency | `scripts/seed.ts` twice | second run skips, no duplicates |

Not verified, by absence of resources rather than by omission:

- The Supabase driver and SQL migrations were not executed against a live project (no credentials).
- A real GLB was never uploaded and rendered (no licensed model was available).
- No browser E2E suite: interactions were verified by build + server rendering + repository smoke
  tests, not by automated clicks.

The 3D scene has its own audit: [`docs/3D-AUDIT.md`](./3D-AUDIT.md). Placement rules are gated by
`npm run audit:3d` (inside `npm run check`), surfaced at `/admin/scene` for the published scene and
live in the 3D editor while a house is dragged.

## Implemented

### Public experience
- Editorial landing page with live 3D masterplan, typology catalogue, availability table and enquiry
  form; progressive WebGL with an accessible fallback and an explicit demonstration notice.
- Property index with typology and availability filters, and detail pages with gallery, SVG floor
  plan, specification, interior launcher, viewing request and related homes.
- Enquiry and viewing actions: Zod validation, consent requirement, honeypot, per-IP rate limiting,
  retention timestamps.
- Login page with safe `next` redirection and demo pre-fill in development.

### 3D system
- Procedural site (174 × 146 m, fenced perimeter, one gate), 13 homes with typology-specific
  massing, driveways, planting and lighting; camera modes for site and plan view.
- **Masterplan composition**, reviewed against a rendered plan (`docs/masterplan.png`, produced by
  `scripts/render-plan.ts`): a north row (H01–H04), an east row (H05–H08), a south row
  (H09–H12) and a west park house (H13), all fronting the same circuit road at a constant 7.5 m
  setback. No driveway crosses a building, and the circuit is an exact rounded rectangle — the
  previous axis-aligned approximation disagreed with the drawn road by up to 3 m at the corners.
- **Roundabout-free ring + boulevard**: the gate opens onto a tree-lined boulevard that tees into
  the circuit; a service road links the circuit to the sports park. Kerbs, centre-line markings and
  low planting bed borders define every edge.
- **Condominium lagoon** at the centre: a 32 × 20 m stone-decked lagoon with mosaic basin, submerged
  steps, a row of sun loungers, parasols and an open pavilion, lit from below at night.
- **Sports park (west)**: fenced football pitch (24 × 34 m), basketball and futsal courts with
  regulation markings, goals, hoops, floodlights, benches, a clubhouse with terrace and parking.
- **Planting**: vegetation only ever spawns inside declared planting beds with clipped hedge borders,
  so trees, shrubs and flowers cannot land in a plot, on a carport, on a pool or on a road — the
  invariant is asserted in `tests/site.test.ts`.
- **Parking:** every home has a parking bay in its front garden — a double carport with two cars for
  T3/T4, a single carport for T1/T2. The bay is offset beside the entrance door, keeps a setback from
  the kerb, stays inside the plot walls, and the gravel driveway is routed to it. Corner plots pick
  the side that actually reaches a road.
- **Private plots:** every home is enclosed by rendered boundary walls (two side walls plus a rear
  wall), clipped to the fence and sized so party walls never cross into a neighbouring footprint.
  Plots now carry an 11 m rear garden (was 5.2 m) and a 1.7 m side margin, so the walls, the pools
  and the sun decks all have room and the houses are spaced on a regular 5 m rhythm.
- **Pools:** eight of the thirteen homes have a private pool — every T4 and T3, plus the T2s whose
  stable code hash selects them; T1s get a walled garden instead. Each pool is presented with a
  timber sun deck, pale stone coping, an aqua mosaic basin with submerged steps, a steel ladder, two
  loungers, a parasol, planters and underwater lighting after dark. The deck grows with the garden
  (up to 1.6 m), and pool placement stays clear of the roads, the boulevard and every other
  footprint — asserted per unit in the test suite.
- **Day / night:** one `timeOfDay` switch retints sky, sun/moon, exposure, stars, window glass, lamp
  heads and pool water across the site, the house exteriors and the interiors.
- **Camera framing** follows the enlarged site: the overview sits at (96, 74, 132) looking at the
  site centroid, plan view rises to 132 m, and the shadow camera and fog now cover the full extent.
- **360° orbit:** selecting a home eases the camera from wherever it is into a nine-second 360°
  orbit of that house, then hands control back for free orbiting; plan view, overview and exit
  restore the default camera.
- **Vegetation:** instanced trees with per-species merged canopies, a brighter layered material and
  deterministic per-instance tinting. Density is deliberately restrained (96 trees, 54 in the
  low-quality tier) so the houses and plots stay legible; hedge-bordered beds, flowering borders,
  shrubs and street lamps follow the same palette.
- **Appliances:** a procedural kitchen and laundry pack — fridge, induction hob, oven, extractor,
  dishwasher, microwave and washer/dryer — shown in the interiors behind a toggle and listed on
  every property page.
- Interiors: dollhouse cutaway and room view, furniture toggle, room shortcuts, WebGL fallback.
- Model reference grammar (`procedural:…`, `asset:CODE`, `/uploads/…`, `https://…`) with a
  non-throwing `missing` state, so a broken reference degrades instead of crashing.

### Administration
- Guarded shell with role-aware navigation, responsive sidebar, session menu.
- Dashboard: portfolio/CRM metrics, availability mix, draft-pending alert, activity feed.
- Properties: create/edit with typology-locked bedroom counts, availability workflow (reservation
  records), publication and archiving, media manager, model replacement, position summary, history.
- 3D editor: selection, numeric and nudged transforms, rotation steps, live preview, discard, save
  draft, restore published, publish (admin only), unsaved-change guard and `beforeunload` warning.
- Leads: filters, statuses, notes, GDPR erasure, CSV export (auth-guarded).
- Viewings: upcoming/history, confirmation with timestamps, rescheduling, admin notes.
- Media & assets: photography per home; GLB pipeline with validation and publication gates.
- Settings: contact details, currency, viewing slot/lead time, retention, team roles, environment
  summary, audit log.
- Server actions for every mutation, each re-checking the caller's capability server-side and
  revalidating affected public and admin paths.

### Data, security, operations
- `DataGateway` with SQLite and Supabase implementations; identifier allowlists; JSON columns
  serialised portably; transactions around multi-row operations.
- Schema, seed (13 homes with the approved typology counts, 3 staff, 8 assets, 68 media rows,
  sample leads/viewings), RLS migration, idempotent bootstrap.
- scrypt password hashing, hashed session tokens, httpOnly cookies, 7-day expiry, capability matrix.
- Upload validation by MIME allowlist **and** magic bytes, size caps, random filenames, traversal-safe
  serving route.
- `README.md`, `.env.example`, seed/reset/smoke scripts, and this report.

## Deliberate decisions

1. **Draft and published coordinates are separate columns.** Publishing is a copy operation; the
   public query never reads draft values. This is stronger than a boolean flag and makes
   "don't publish half-finished edits" true at the data level.
2. **Availability ≠ visibility.** Commercial state never hides a home implicitly, and archiving
   preserves reservations, leads and viewings for audit.
3. **Authorisation in the repository layer,** mirrored in the UI only to avoid dead ends. A crafted
   request cannot bypass a hidden button.
4. **Procedural everything.** No external textures or models, so the demo is deterministic, offline
   and free of licensing risk. Uploads replace procedural assets only after validation.
5. **Zod schemas shared** between client forms and server actions: one source of rules and messages.

## Placeholder / demonstration content

- All photography is generated in-app; the seeded media rows reference generated placeholders.
- Site dimensions, house plans and the masterplan are stylistic, not surveyed.
- Interiors are indicative massing, not measured interiors.
- "Demo mode" stays on by default and surfaces a notice on the public site.

## Dependencies

Runtime: Next 15, React 19, three.js + @react-three/fiber + drei, framer-motion, Zod, Tailwind,
`node:sqlite` (built in), optional `@supabase/supabase-js`.
No paid service is required for the local configuration; Supabase is optional.

## Suggested next steps

1. Replace demonstration imagery and the masterplan with surveyed/photographic assets.
2. Run the Supabase migrations on a real project and re-run the smoke suite against it.
3. Upload a representative GLB and confirm scale/orientation against a known footprint.
4. Add transactional email for enquiries and viewing confirmations.
5. Move rate limiting to a shared store if the app runs on more than one instance.
