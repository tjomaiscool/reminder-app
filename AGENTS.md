# Instructions for AI coding agents and contributors

These instructions apply to repository changes unless a more specific instruction is added in a subdirectory. Read [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/TASKS.md](docs/TASKS.md) before proposing changes to hosting, mobile, PWA, or notifications.

## Project at a glance

Cadence is a **single-user, periodic-task reminder app** written in TypeScript. Current code is not yet a deployed multi-service application.

- `src/client/main.ts` — browser state, views, DOM rendering, and `/api/*` calls.
- `public/index.html`, `public/styles.css` — static shell and styles, including mobile media queries.
- `src/server/server.ts` — Node HTTP server, API routes, static asset serving.
- `src/server/domain.ts` — task scheduling, date/time-zone logic, weekly reports.
- `src/server/database.ts` — current local JSON-file persistence.
- `src/shared/types.ts` — API/domain data contracts shared by client and server.
- `data/db.json` — personal local data, ignored by Git; never commit it.

## Build and local verification

```bash
npm install
npm run build
npm start
# open http://localhost:4173
```

- The repository currently has `build`, `build:server`, `build:client`, `start`, and `dev` scripts; do not claim that automated unit/lint/test scripts exist until they are added.
- Compile both client and server after TypeScript changes.
- For behavior changes, add or propose focused automated tests; verify date boundaries and persisted history.
- Keep changes small, reviewable, and scoped to the corresponding task ID in `docs/TASKS.md`.

## Product/domain invariants

- Weeks run **Monday–Sunday**; task completion records retain their original `YYYY-MM-DD` date keys and timestamps.
- Task schedules can have specific weekdays or a flexible weekly completion target.
- The Today view differentiates Must Do Today, Optional Today, and Other Active Items; previous missed fixed-day opportunities are visible.
- Historical Reports must stay correct when the current week advances.
- The server's `APP_TIME_ZONE` defaults to `Europe/Copenhagen`; changes must consider device/server time-zone differences and daylight-saving transitions.
- Preserve existing API shape and report semantics unless a change is explicitly reviewed together with client compatibility.

## Delivery sequence

1. First establish protected, durable hosting on **Vercel (web), Render (API), and Neon (PostgreSQL)**.
2. Next audit and improve the phone-sized UI using actual device checks.
3. Then make the site installable as a PWA.
4. Last, design opt-in push reminders and scheduled progress reports.

Do not implement a later phase by silently expanding an earlier-phase PR. This initial roadmap proposal is **documentation only**.

## Security and data safeguards

- **No public unauthenticated task API.** The original app assumes one trusted local user; this assumption must be revisited before production exposure.
- Never commit `.env` files, database credentials, VAPID private keys, push subscriptions, or real `data/db.json` contents.
- Do not place the Neon connection string or other server secrets in Vercel browser bundles.
- Keep browser/API origin and credential behavior explicit; do not rely on wildcard CORS for access control.
- Do not assume a hosting filesystem is durable. Migrate stored task history carefully, with backup and verification.
- Service workers and notifications must be opt-in, privacy-conscious, and conservative about caching authenticated responses.

## Expectations for changes and pull requests

- Reference the relevant roadmap task IDs, explain the user-visible effect, and state any migration/deployment steps.
- Include verification steps and known limitations; do not mark incomplete deployment or untested mobile flows as finished.
- Prefer focused changes and no unrelated frontend framework rewrite.
- Separate architecture decisions from implementation when choices are not yet approved.
- Keep README and relevant Markdown documents consistent as milestones change.
- Request maintainer review before merging; do not self-approve or bypass repository protections.

## Documentation source of truth

- [docs/ROADMAP.md](docs/ROADMAP.md) — phase goals, architecture proposal, prerequisites, exit criteria, open decisions.
- [docs/TASKS.md](docs/TASKS.md) — prioritized, independently reviewable implementation tasks.

If documentation and implementation disagree, report the discrepancy instead of silently assuming the document describes shipped functionality.