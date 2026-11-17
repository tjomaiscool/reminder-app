# Cadence reminder app

Cadence is a personal periodic-task reminder app written entirely in TypeScript. It has:

- a Node.js HTTP server;
- a browser client compiled from TypeScript;
- Neon PostgreSQL persistence, with a JSON-file fallback for local development;
- a Today view with Must Do Today, Optional Today, and Other Active Items;
- a Reports view for the current week and any past week;
- an Admin view for creating and managing recurring tasks.

Cadence supports one shared password for its single-user workspace. Production startup requires `APP_PASSWORD`; do not deploy without setting it as a Render secret.

## Run it

Install dependencies and build the TypeScript source:

```bash
npm install
npm run build
npm test
npm start
```

Then open `http://localhost:4173`. Without `DATABASE_URL`, local development continues to use `data/db.json`, which is ignored by Git.

## Password access

Set `APP_PASSWORD` in the environment to enable password login. Use a randomly generated value of at least 32 UTF-8 bytes. Local development may omit it; production startup fails if it is missing. Changing the password invalidates existing sessions.

For local password-protected development, add this to `.env`:

```dotenv
APP_PASSWORD="<your generated password>"
```

## Use Neon PostgreSQL

Create a Neon project and add its connection strings to a root-level `.env` file. Use the pooled connection string for app traffic and the direct (unpooled) string for migrations and imports. `.env` is ignored by Git; keep both values private and never put them in browser configuration.

In `.env`, use your actual URLs without sharing them in chat:

```dotenv
DATABASE_URL="<Neon pooled connection string>"
MIGRATION_DATABASE_URL="<Neon direct connection string>"
```

Then, from the project directory, run:

```powershell
npm run db:migrate
```

`npm run db:migrate` applies the checked-in schema migration. To import the existing local database, first make a separate backup of `data/db.json`, then run:

```powershell
npm run db:import
```

The importer validates task and completion records, preserves their IDs, schedules, date keys, and timestamps, and writes them in a transaction. It refuses to import into a non-empty Neon database; it does not modify or delete the local JSON file. A different JSON file can be supplied as an argument to the compiled importer:

```powershell
node dist/server/import-json.js "C:\path\to\db.json"
```

Set `DATABASE_URL` when starting the app to use Neon. The server verifies that the schema is already applied and fails on startup if it is missing. In production, `DATABASE_URL` is required; the JSON fallback is only for local development.

Local development remains bound to localhost. In production, `GET /api/health` stays public for Render's health check; task and report APIs require a valid password session.

## Deployment preparation (Vercel + Render)

Production uses a signed, HTTP-only, `Secure`, `SameSite=Strict` session cookie that expires after 30 days. Passwords must be at least 32 UTF-8 bytes. Mutating API requests also require a same-origin custom header; permissive CORS remains disabled. Keep the password in environment variables only; do not commit it or put it in Vercel settings.

The Render Blueprint in `render.yaml` configures the Node service, health check, time zone, and required `APP_PASSWORD` and `DATABASE_URL` secrets. Its service name is `cadence-api`; `vercel.json` routes `/api/*` through Vercel to that Render hostname. If Render assigns a different service hostname, update the Vercel rewrite destination.

The Vercel build assembles `public/` and the compiled browser client into `dist/vercel/`:

```powershell
npm run build:vercel
```

Import the repository into Vercel with the **Other** framework preset. `vercel.json` configures the build command, output directory, and `/api/*` rewrite; no API secret belongs in Vercel.

In Render, set `APP_PASSWORD` to your chosen password and `DATABASE_URL` to the Neon pooled connection string. Apply migrations separately from a trusted machine using the direct Neon connection string and `npm run db:migrate`; never put the password or either connection string in Vercel settings or source control. To enable password protection locally too, add `APP_PASSWORD` to `.env`. Changing the password invalidates existing sessions. The Render free plan may spin down while idle, but task persistence remains in Neon.

## Reports and history

The Reports view lets you move backward through completed weeks with the week picker or previous-week button. Fixed-day tasks are shown day by day, while flexible tasks are summarized against their weekly target.

You can record a completion for any past date from a report. The Today view also shows unfinished fixed-day tasks from earlier in the current week under **From previous days**, where they can be completed directly.

## Scheduling rules

Each active task has a weekly completion target and may optionally have fixed days:

- With fixed days, the task is due on those days and remains visible as an active item if a prior scheduled day was missed.
- Without fixed days, the task can be completed on any day. It appears under Optional Today until the remaining days are no longer enough to meet its target, then moves to Must Do Today.
- Completion counts are calculated for the current Monday–Sunday week and are persisted as individual completion records.
- Historical completion records remain attached to their original date, so past reports keep their own totals when the current week changes.
