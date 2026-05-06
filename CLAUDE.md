# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Express + Vite HMR on port 3000)
pnpm build        # Build frontend (Vite) + bundle server (esbuild) → dist/
pnpm start        # Run production build
pnpm check        # TypeScript type check (no emit)
pnpm format       # Prettier format all files
pnpm test         # Run Vitest (server tests only: server/**/*.test.ts)
pnpm db:push      # Generate and apply Drizzle migrations (requires DATABASE_URL)
```

Run a single test file:
```bash
pnpm vitest run server/path/to/file.test.ts
```

## Architecture

This is a full-stack TypeScript monorepo with a React SPA frontend and an Express/tRPC backend.

### Directory layout

- `client/src/` — React frontend (Vite, root at `client/`)
- `server/` — Express server entry and feature code
- `server/_core/` — Framework wiring: Express entry (`index.ts`), tRPC setup (`trpc.ts`), auth context (`context.ts`), OAuth callback (`oauth.ts`), env (`env.ts`), session cookies, storage helpers
- `shared/` — Code shared between client and server (types, constants, schema utilities)
- `drizzle/` — Drizzle ORM schema (`schema.ts`) and generated migration files
- `scripts/` — One-off utility scripts

### Path aliases

| Alias | Resolves to |
|---|---|
| `@` | `client/src/` |
| `@shared` | `shared/` |
| `@assets` | `attached_assets/` |

### API layer (tRPC)

All API calls go through tRPC at `/api/trpc`. The router tree lives in `server/routers.ts` and imports sub-routers. Three procedure types are available from `server/_core/trpc.ts`:

- `publicProcedure` — no auth required
- `protectedProcedure` — requires authenticated user (throws `UNAUTHORIZED` otherwise)
- `adminProcedure` — requires `user.role === 'admin'` (throws `FORBIDDEN` otherwise)

The client wires up tRPC in `client/src/main.tsx` using `httpBatchLink` with `superjson` transformer. The typed client is at `client/src/lib/trpc.ts`.

### Authentication

OAuth via the Manus SDK (`server/_core/sdk.ts`). The flow: `/api/oauth/callback` exchanges a code for a token, upserts the user in MySQL, then sets a signed session cookie. Each tRPC request runs `sdk.authenticateRequest(req)` to populate `ctx.user`.

The first user whose `openId` matches `OWNER_OPEN_ID` env var is auto-assigned the `admin` role.

### Database

MySQL via Drizzle ORM. Schema in `drizzle/schema.ts`. The `getDb()` helper in `server/db.ts` is lazy — it returns `null` if `DATABASE_URL` is unset, so the server starts without a DB (useful for local tooling).

Domain tables: `users` (roles: admin/doctor/patient), `patients`, `studies` (DICOM Study UID), `series`, `instances`, `reports`, `doctorPatients` (many-to-many), `studyAccess` (sharing), `uploadTokens` (guest upload links).

### DICOM viewer

`client/src/lib/cornerstone.ts` wraps Cornerstone.js initialization. **Order matters**: `cornerstone.init()` must run before wiring up the WADO loader. The singleton `isInitialized` guard and `initPromise` prevent duplicate initialization. `EnhancedDicomViewer` (`client/src/components/EnhancedDicomViewer.tsx`) is the main viewer component and supports both full-screen overlay and inline (`inline` prop) modes.

### Storage

`server/storage.ts` provides `storagePut` / `storageGet` that proxy through the Manus Forge API (env vars `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY`). AWS S3 SDK is also a dependency but currently unused — the stub in `studies.uploadDicom` is a TODO.

### Frontend routing

Client-side routing via `wouter`. Routes are defined in `client/src/App.tsx`. The layout shell is `client/src/components/DashboardLayout.tsx`.

### Environment variables

Required at runtime (see `server/_core/env.ts`):
- `DATABASE_URL` — MySQL connection string
- `JWT_SECRET` — cookie signing secret
- `OAUTH_SERVER_URL` — Manus OAuth server
- `OWNER_OPEN_ID` — openId of the app owner (gets admin role)
- `VITE_APP_ID` — app identifier
- `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` — file storage proxy
