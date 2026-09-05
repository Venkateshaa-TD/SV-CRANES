# FleetView — Crane & Fleet Operations Management System

Internal, mobile-first web application for managing a crane/fleet operation:
vehicles, daily logs, fuel, expenses, customers, projects, billing,
invoicing, payments, maintenance, documents, and reporting.

This repository currently contains the **application foundation**
(architecture, auth, database schema, mobile shell, shared components).
Module workflows (vehicle CRUD, billing engine, etc.) are implemented in
later phases — see [Remaining work](#remaining-work) at the bottom.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, Server Components by default)
- TypeScript (strict mode)
- PostgreSQL + [Prisma ORM 6](https://www.prisma.io/)
- Tailwind CSS v4
- Radix UI primitives (hand-built shadcn-style component layer, no CLI dependency)
- [Auth.js (NextAuth) v5](https://authjs.dev/) — credentials provider, JWT sessions
- Zod + React Hook Form
- Vitest + Testing Library

## Prerequisites

- Node.js 20+ (developed against Node 24)
- npm
- A PostgreSQL 14+ database (local install, Docker, or a hosted instance)

## 1. Install dependencies

```bash
npm install
```

`npm install` also runs `prisma generate` automatically via a `postinstall`
hook.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/fleetview?schema=public` |
| `AUTH_SECRET` | Random secret used to sign session JWTs. Generate one with `openssl rand -base64 32`. |
| `AUTH_URL` / `NEXTAUTH_URL` | Base URL of the running app, e.g. `http://localhost:3000` |
| `STORAGE_PROVIDER` | `local` for development (writes to `.uploads/` on disk, gitignored). A real deployment would add an S3-compatible provider here — see `src/lib/storage`. |

## 3. Set up PostgreSQL

Any PostgreSQL 14+ instance works. Options:

- **Local install**: create a database, e.g. `createdb fleetview`.
- **Docker**:
  ```bash
  docker run --name fleetview-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fleetview -p 5432:5432 -d postgres:16
  ```
- **Hosted** (Neon, Supabase, RDS, etc.): paste the provided connection string into `DATABASE_URL`.

## 4. Run migrations

```bash
npm run db:migrate
```

This applies `prisma/schema.prisma` to your database and generates the
Prisma Client. Use `npm run db:push` instead if you want to sync the schema
without creating a migration history (fine for early local iteration).

`npm run db:studio` opens Prisma Studio, a GUI for browsing/editing rows —
useful for inspecting seed data.

## 5. Seed development data

```bash
npm run db:seed
```

Creates one demo company, one user per role (two operators), three sample
vehicles, and two sample customers. All seeded users share the password
`ChangeMe123!` — **local development only, never reuse in any deployed
environment.** The full account list and password are also printed to the
console when the seed script runs; see `prisma/seed.ts`.

| Role | Email |
| --- | --- |
| SUPER_ADMIN | `owner@svcranes.dev` |
| MANAGER | `manager@svcranes.dev` |
| ACCOUNTANT | `accountant@svcranes.dev` |
| SUPERVISOR | `supervisor@svcranes.dev` |
| OPERATOR | `operator1@svcranes.dev` |
| OPERATOR | `operator2@svcranes.dev` |

## 6. Start the dev server

```bash
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`. The app is
mobile-first; use your browser's device toolbar (or an actual phone on the
same network) to see it as intended, but it also works at desktop widths.

## Testing

```bash
npm test          # run once
npm run test:watch
```

Covers authentication input validation, the centralized authorization
helper (role defaults + individual permission overrides), and file-upload
validation. See `src/**/*.test.ts`.

## Linting, formatting, type-checking

```bash
npm run lint
npm run format        # write
npm run format:check  # check only
npm run typecheck
```

## Production build

```bash
npm run build
npm start
```

## Architecture overview

```
src/
  app/
    (auth)/login/          Public login route
    (app)/                 Authenticated app shell + all module routes
    api/auth/[...nextauth] Auth.js route handler
    api/files/[...key]     Authenticated file download (local storage provider)
    manifest.webmanifest/  PWA manifest (route handler)
  components/
    ui/                    Low-level primitives (button, input, dialog, drawer, …)
    forms/                 Mobile-first field primitives (TextInput, CurrencyInput, FileUpload, …)
    data/                  ResponsiveDataView — table on desktop, cards on mobile
    layout/                App shell: sidebar, bottom nav, header, permission gate
    dashboard/              Dashboard stat tiles
    shared/                 Empty/forbidden/phase-placeholder states
  lib/
    auth/                  Auth.js config, permission catalogue, authorization helpers
    db/                    Prisma client singleton
    storage/                Storage abstraction (local disk today, S3-ready interface)
    audit/                  Audit log service
    validation/              Zod schemas
    navigation.ts            Single source of truth for nav structure + required permissions
prisma/
  schema.prisma             Full data model (see below)
  seed.ts                    Development seed data
```

### Authentication & authorization

- **Authentication**: Auth.js v5, Credentials provider (email + bcrypt
  password hash), JWT session strategy. See `src/lib/auth/auth.ts`.
- **Authorization**: centralized permission catalogue in
  `src/lib/auth/permissions.ts` (`PERMISSIONS` constants + per-role
  defaults in `ROLE_PERMISSIONS`). Nothing in the UI checks
  `role === "SUPER_ADMIN"` directly — every check goes through
  `can()` / `requirePermission()` in `src/lib/auth/authorize.ts`.
- **Individual overrides**: the `UserPermission` model lets specific users
  be granted or denied a permission regardless of role, layered on top of
  role defaults in `getEffectivePermissions()`. This is what will let a
  small number of named users edit customer financial data later, without
  hardcoding names or forking role logic now — grant them
  `customer:financial:edit` via `UserPermission` when that phase ships.
- **Defense in depth**: middleware (`src/middleware.ts`) redirects
  unauthenticated requests, the `(app)` layout re-checks the session
  server-side, and every page wraps its content in `<PermissionGate>`
  which re-checks the specific permission required — a hidden nav link is
  never treated as access control.

### Mobile-first navigation

- Below the `md` breakpoint: fixed bottom nav (Dashboard, Daily Log,
  Fleet, More) + a bottom drawer ("More") listing every other permitted
  module, grouped.
- `md` and up: fixed left sidebar with the full grouped navigation.
- Both render from the single `NAV_GROUPS` list in `src/lib/navigation.ts`,
  filtered server-side to the signed-in user's effective permissions in
  `AppShell` — there is exactly one place navigation structure is defined.

### Database

See `prisma/schema.prisma` for the full model. Highlights:

- Money fields use `Decimal`, never `Float`.
- Soft-delete pattern (`archivedAt`, `isActive`) instead of hard deletes on
  business records.
- A `Project` can have many `Vehicle`s over time via
  `ProjectVehicleAssignment` (never a fixed 1:1).
- `Payment` → `PaymentAllocation` → `Invoice` supports partial payments and
  payments split across multiple invoices.
- `AuditLog` and `Notification` are modelled now; only a minimal
  read-only Audit Logs page exists so far (Admin → Audit Logs) — full
  auditing coverage and in-app notification delivery are later-phase work.
- `FileAsset` + `src/lib/storage` decouple file metadata/business code from
  the actual storage backend (local disk in dev; swap in an S3-compatible
  provider later by implementing `StorageProvider` — no caller changes).

## Remaining work (Phase 1+)

This foundation intentionally does **not** implement full module
workflows. Each of the following still needs its create/edit/list/detail
flows, business logic, and validation built out:

- Vehicles (CRUD, document expiry tracking)
- Daily logs, fuel entries, expenses (submission + approval workflow)
- Customers, projects, employee management
- Billing engine, invoicing, payment recording & allocation, outstanding
  balances, customer ledger
- Maintenance scheduling
- Reports
- Full admin: user/role management UI, granting individual permission
  overrides, settings
- Full notification delivery (the model and permission exist; nothing
  writes notifications yet)
- Real app icons for the PWA manifest (currently a placeholder SVG mark)

Do not start on these without confirming scope/priority first.
