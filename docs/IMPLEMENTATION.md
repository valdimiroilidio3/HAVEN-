# HAVEN® — Implementation report

Status as delivered on this branch. Everything below was executed in this workspace unless it is
explicitly marked **unverified**.

## Verification performed

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript (strict) | `npx tsc --noEmit` | pass, 0 errors |
| Lint | `npm run lint` | pass, 0 errors (warnings only) |
| Unit tests | `npx vitest run` | 30/30 pass |
| Data-layer smoke | `npx tsx scripts/smoke.ts` | 22/22 checks pass |
| Production build | `npm run build` | pass; 17 routes + middleware compiled |
| Public rendering | HTTP against `next dev` | `/`, `/properties`, `/properties/[slug]`, `/visit`, `/login` → 200 |
| Admin rendering | HTTP with a real session cookie | all 8 admin routes → 200 |
| Upload serving | HTTP | `/uploads/<file>` 200 with correct MIME; traversal and missing files → 404 |
| Password verification | scrypt round-trip against seeded admin | correct password true, wrong password false |
| Seed idempotency | `scripts/seed.ts` twice | second run skips, no duplicates |

Not verified, by absence of resources rather than by omission:

- The Supabase driver and SQL migrations were not executed against a live project (no credentials).
- A real GLB was never uploaded and rendered (no licensed model was available).
- No browser E2E suite: interactions were verified by build + server rendering + repository smoke
  tests, not by automated clicks.

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
- Procedural site (96 × 92 m), 13 homes with typology-specific massing, driveways, planting and
  lighting; camera modes for site and plan view.
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
