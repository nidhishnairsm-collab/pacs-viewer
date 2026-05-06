# Running locally

## Prerequisites

- Node.js v20+
- pnpm (`npm install -g pnpm`)
- Docker (for MySQL)

## 1. Start MySQL

```bash
docker run -d --name pacs-db -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=pacsviewer \
  mysql:8
```

## 2. Create the database schema

```bash
pnpm db:push
```

This reads `DATABASE_URL` from `.env` and creates all tables.

## 3. Install dependencies

```bash
pnpm install
```

## 4. Start the dev server

```bash
pnpm dev
```

App runs at `http://localhost:3000`.

## 5. First login

Go to `http://localhost:3000/login` and click **Register**.
The first account created automatically gets the **admin** role.

## Stopping / restarting the database

```bash
docker stop pacs-db   # stop
docker start pacs-db  # restart (data is preserved)
docker rm pacs-db     # remove container entirely
```

  ┌────────────────────────────┬────────────────────────────────────────────────────────────┐
  │            File            │                           Change                           │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ vite.config.ts             │ Removed vite-plugin-manus-runtime                          │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ server/_core/sdk.ts        │ Stripped Manus OAuth API calls; kept JWT session utilities │
  │ server/_core/sdk.ts        │ Stripped Manus OAuth API calls; kept JWT session utilities │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ server/_core/oauth.ts      │ Replaced with no-op (no OAuth callback needed)             │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ server/_core/cookies.ts    │ Fixed sameSite: "lax" on http so cookies work locally      │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ server/_core/index.ts      │ Added /uploads static file serving                         │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ server/storage.ts          │ Replaced Forge API with local ./uploads/ filesystem        │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ server/routers.ts          │ Added auth.register and auth.login tRPC mutations          │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ server/db.ts               │ Added getUserCount() helper                                │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ drizzle/schema.ts          │ Added passwordHash column to users                         │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ client/src/const.ts        │ getLoginUrl() now returns /login                           │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ client/src/pages/Login.tsx │ New login/register page                                    │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ client/src/App.tsx         │ Added /login route                                         │
  ├────────────────────────────┼────────────────────────────────────────────────────────────┤
  │ .env                       │ Created with local MySQL connection string                 │
  └────────────────────────────┴────────────────────────────────────────────────────────────┘