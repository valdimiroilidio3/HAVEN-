# HAVEN®

A real-estate platform for a single condominium of **13 homes across four typologies (T1–T4)**:
a public editorial site with an interactive 3D masterplan and interiors, and a private
administration area for availability, enquiries, viewings, media, 3D assets and site settings.

Built with Next.js 15 (App Router, Server Actions), React 19, TypeScript (strict), Tailwind CSS,
three.js via react-three-fiber, Zod and SQLite (or Supabase Postgres).

---

## Quick start

```bash
npm install
cp .env.example .env.local      # optional for local use; safe defaults apply
npm run dev                     # http://localhost:3000
```

The local database is created and seeded automatically on first request
(`.data/haven.db`). To seed or reset explicitly:

```bash
npm run db:seed
HAVEN_CONFIRM_RESET=yes npm run db:reset
```

### Demo accounts

| Role    | Email               | Password     | Can do                                            |
| ------- | ------------------- | ------------ | ------------------------------------------------- |
| Admin   | `admin@haven.pt`    | `Haven!2026` | Everything, including publishing and archiving    |
| Manager | `manager@haven.pt`  | `Haven!2026` | Edit content, statuses, media, drafts             |
| Viewer  | `viewer@haven.pt`   | `Haven!2026` | Read-only access to the administration area       |

Override the seeded administrator with `HAVEN_SEED_ADMIN_EMAIL` / `HAVEN_SEED_ADMIN_PASSWORD`.
The public login form pre-fills the demo administrator in development.

---

## Public site

| Route                | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `/`                  | Landing: 3D masterplan, typologies, available homes, enquiry form           |
| `/properties`        | Index with typology and availability filters                                |
| `/properties/[slug]` | Home detail: gallery, plan, specification, interiors, viewing request        |
| `/visit`             | Private viewing request                                                     |
| `/login`             | Staff sign-in                                                               |

The viewer is progressive: WebGL renders the condominium, houses are selectable, the camera can
switch to plan view, and each home opens a full-screen interior with a dollhouse/room-view toggle,
furniture toggle and room shortcuts. If WebGL is unavailable, an accessible fallback with the
same information is shown instead of an empty canvas.

**All imagery and models are demonstration material** generated in-app (procedural textures,
procedural geometry). Nothing is a survey, a photograph of a real home, or a binding plan.

---

## Administration (`/admin`)

| Area              | Highlights                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| Overview          | Portfolio and CRM metrics, draft-pending warning, recent enquiries and viewings   |
| Properties        | Create, edit, filter, inspect; availability workflow; publication and archiving   |
| 3D masterplan     | Select a home, nudge/rotate with numeric controls, live 3D preview, save, publish |
| Leads             | Statuses, internal notes, GDPR erasure, CSV export                                |
| Viewings          | Upcoming and historical appointments, confirmation, rescheduling                  |
| Media & assets    | Photography per home, GLB model pipeline with validation and publication gates    |
| Settings          | Contact details, currency, viewing rules, retention, team roles, activity log     |

### The 3D experience

The masterplan is a full procedural site (108 × 104 m, fenced, one gate). Every home sits in a
private walled plot with a driveway; eight of the thirteen have a pool and deck, the rest a walled
garden. Clicking a house eases the camera into a nine-second 360° orbit and then lets you orbit
freely, and a day/night switch retints sky, lighting, stars, glass and pool water across the site
and the interiors. The interiors are furnished and delivered with a kitchen and laundry appliance
pack (fridge, induction hob, oven, extractor, dishwasher, microwave, washer/dryer), which can be
toggled and is listed on each property page.

Availability (`available`, `reserved`, `sold`, `hidden`) and visibility (`draft`, `published`,
`archived`) are deliberately independent. Archiving never deletes commercial history, and a
reservation records who reserved, until when, and the deposit.

### 3D editing and publishing

Draft and published coordinates are stored side by side (`x/z/rotation_y` vs
`published_x/published_z/published_rotation_y`). The public viewer reads only published values, so
an unfinished edit can never leak to the site. Saving and publishing are separate permissions:
managers can prepare drafts, only administrators can publish. Overlapping footprints are rejected
server-side before a draft is stored.

---

## Architecture

```
src/
  app/                  routes (public, admin, api, uploads)
  components/
    public/             header, footer, forms, login, interior launcher
    viewer/             masterplan experience, interior experience
    admin/              shell, forms, editors, scene editor
    three/              procedural houses, interiors, furniture, environment
    plan/               SVG floor plans
    ui/                 button, badge primitives
  lib/
    domain/             types, Zod schemas, constants, inventory, floor plans, metrics
    db/                 gateway + SQLite/Supabase drivers, schema, seed, repositories
    auth/               session, password hashing, rate limiting
    actions/            server actions (public, auth, admin)
  middleware.ts         early cookie gate; real authorisation happens on the server
supabase/migrations/    0001_init.sql, 0002_rls.sql
scripts/                seed, reset, smoke
tests/                  vitest unit tests
```

- **Data access** is a single `DataGateway` interface with two drivers. Every table and column name
  is validated against an allowlist before reaching SQL.
- **Authorisation** is enforced in the repository layer on every mutation (`can(role, capability)`),
  not only in the UI. Session tokens are random, hashed at rest, httpOnly and expire after 7 days.
- **Validation** happens once in `lib/domain/validation.ts` (Zod) and is shared by forms and actions.
- **Uploads** are validated by MIME allowlist plus magic bytes, size-capped, renamed to random
  identifiers, and served from an allowlisted route with traversal protection.

---

## Environment

See `.env.example`. The important variables:

| Variable                    | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `HAVEN_DB_DRIVER`           | `sqlite` (default) or `supabase`                            |
| `HAVEN_DATA_DIR`            | SQLite database and uploads directory (default `.data`)     |
| `NEXT_PUBLIC_SITE_URL`      | Canonical URL used in metadata                              |
| `NEXT_PUBLIC_SUPABASE_URL`  | Supabase project URL                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key; never exposed to the browser               |
| `SUPABASE_MEDIA_BUCKET`     | Storage bucket for uploads (default `haven-media`)          |

### Supabase

1. Create the project and run `supabase/migrations/0001_init.sql`, then `0002_rls.sql`.
2. Set the variables above and `HAVEN_DB_DRIVER=supabase`.
3. Seed once with `npm run db:seed` (uses the service role).

The Supabase driver compiles against the same interface, but **it could not be exercised here** —
no project credentials were available. Treat remote persistence and Storage as unverified until
you run the migrations against a real project.

---

## Quality gates

```bash
npm run typecheck   # tsc --noEmit, strict
npm run lint        # next lint, no errors
npm test            # vitest unit tests
npm run smoke       # data-layer end-to-end checks (throwaway SQLite)
npm run check       # all of the above plus a production build
```

The smoke suite covers permission boundaries, status/reservation transitions, draft-vs-published
scene separation, consent enforcement, viewing lead times and the public enquiry pipeline.

---

## Known limitations

- Photography, plans and site dimensions are generated demonstration content.
- Interiors are a stylistic massing model, not a photogrammetric reconstruction.
- The upload path is implemented and validated, but no real GLB was available to verify rendering
  of an imported model end-to-end.
- No email delivery is wired: enquiries and viewings are stored and surfaced in the admin area.
- Single-process rate limiting suits one instance; use a shared store when scaling out.
- SQLite is ideal for this single-condominium deployment; use Supabase for multi-instance hosting.
