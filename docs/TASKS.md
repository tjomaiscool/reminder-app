# Cadence — delivery backlog

**Status:** proposed checklist · **Priority order:** Hosting → Mobile UX → PWA installation → Notifications

These are planned tasks, not completed work. Owners, estimates, and delivery dates should be assigned during review. Each ID can become a GitHub issue or a small implementation PR. For context and milestone exit criteria, see [ROADMAP.md](ROADMAP.md).

## Phase 1 — Hosted application (must complete first)

### H-01 — Production access and configuration decision (P0, blocker)
- [ ] Decide the initial identity/authentication model for a private single-user app; explicitly rule out public unauthenticated CRUD access.
- [ ] Define local, staging (if used), and production environment variables and secret handling.
- [ ] Decide whether frontend-to-API traffic uses a Vercel rewrite or a configured cross-origin API URL.
- **Acceptance:** an agreed short security/deployment design covers login/access, API protection, CORS/cookies or token handling, and secret storage.

### H-02 — PostgreSQL schema and migration plan (P0, depends on H-01)
- [ ] Define `tasks` and `completions` entities preserving existing IDs, scheduled weekdays, weekly frequency, enabled status, date keys, and timestamps.
- [ ] Select a SQL driver and migration mechanism appropriate for the existing Node/TypeScript server (avoid a framework rewrite unless justified).
- [ ] Define constraints, indexes, deletion behavior, and idempotent migration steps.
- [ ] Specify a one-time, validated JSON import/export or fresh-start choice; back up `data/db.json` before any migration.
- [ ] Decide what database connection is used for app traffic vs migrations; use TLS and keep secrets server-side.
- **Acceptance:** schema migrations can be applied on an empty Neon database and existing sample task/completion history can be imported and verified without losing historical report counts.

### H-03 — Replace file persistence behind current API (P0, depends on H-02)
- [ ] Introduce a persistence interface or repository boundary and a PostgreSQL implementation.
- [ ] Keep task IDs, completion history, API response contracts, and Monday–Sunday reporting behavior stable.
- [ ] Preserve a documented local development path (local Postgres or an explicitly isolated development database).
- [ ] Add automated coverage for create/update/delete, completion/undo, historical reports, and data across process restarts.
- **Acceptance:** app behavior is equivalent with Neon persistence and no production endpoint depends on `data/db.json`.

### H-04 — Make the HTTP API deployable and protected (P0, depends on H-01)
- [ ] Configure the server to listen on `0.0.0.0` with `process.env.PORT` on Render (current code binds to `127.0.0.1`).
- [ ] Implement the approved authentication/authorization strategy for private task endpoints.
- [ ] Replace permissive CORS behavior with the approved same-origin or explicit-origin approach; handle preflight correctly if cross-origin.
- [ ] Preserve `GET /api/health` without exposing private data; add safe error handling and structured startup logging.
- [ ] Validate required environment variables and production configuration on startup.
- **Acceptance:** API starts on Render, `/api/health` succeeds, unauthenticated access to protected endpoints is rejected, and no secrets are committed.

### H-05 — Build a deployable static frontend (P0)
- [ ] Build `src/client/main.ts` for the browser and assemble `public/` + compiled client into one deterministic static output directory.
- [ ] Keep relative `/api/*` requests working through the chosen routing strategy, or configure the API URL explicitly at build/runtime.
- [ ] Ensure the HTML/CSS/client file paths and caching behavior work from Vercel's URL.
- [ ] Document build and output settings (Vercel framework preset can be `Other`).
- **Acceptance:** generated static output can be served independently of the Node process and communicates with the configured API.

### H-06 — Provision Neon and deploy the Render API (P0, depends on H-02–H-04)
- [ ] Create an appropriately named Neon project/database and apply the migrations.
- [ ] Set Render build/start commands, health-check path, region, Node version, `PORT`, `APP_TIME_ZONE`, `DATABASE_URL`, and secrets.
- [ ] Verify connectivity and TLS; use a direct database connection for migrations when required by the selected tooling.
- [ ] Verify deploy logs and protected endpoints; document any service spin-down / cold-start characteristics of the selected plan.
- **Acceptance:** HTTPS API is healthy and persists task/completion records in Neon after a restart/redeploy.

### H-07 — Deploy the Vercel frontend and connect end to end (P0, depends on H-05–H-06)
- [ ] Create the Vercel project for the static build and configure the chosen API routing.
- [ ] Confirm HTTPS and any expected deployment/custom domains.
- [ ] Verify auth flow and all main API calls from the deployed origin; confirm no CORS, mixed-content, or credential errors.
- [ ] Test Today, Admin, Reports, historical completion, undo, and the current-week boundary.
- **Acceptance:** an external device can use the hosted app privately and see consistent persistent data.

### H-08 — Operational runbook and launch checks (P1, before wider use)
- [ ] Document safe deployment, migrations, rollback, backup, and restore instructions.
- [ ] Add a minimal production smoke-test checklist, error logging, and a way to diagnose failed health checks.
- [ ] Test app time zone and daylight-saving / Monday–Sunday reporting near date boundaries.
- [ ] Review least-privilege access and verify `DATABASE_URL` never appears in browser bundles/logs.
- **Acceptance:** a maintainer can recover from a deployment or database problem using documented steps.

**Phase 1 gate:** No production launch until H-01 through H-07 pass. H-08 is required before expanding beyond a controlled internal pilot.

## Phase 2 — Mobile UX (after hosting)

### M-01 — Phone audit (P1)
- [ ] Test approximately 320–430 CSS px, portrait and landscape, including iPhone Safari and Android Chrome as available.
- [ ] Audit existing `860px`/`620px` responsive rules in `public/styles.css` rather than assuming mobile styles are absent.
- [ ] Record problems in Today, Admin forms/modal, Reports, navigation, keyboard, tap targets, and safe-area insets.
- **Acceptance:** a prioritized list of actual device/screensize issues with reproducible steps/screenshots.

### M-02 — Make primary flows mobile-friendly (P1, depends on M-01)
- [ ] Fix priority issues without changing task semantics.
- [ ] Validate one-handed completion/undo, readable status, simple task creation/editing, and report navigation.
- [ ] Test accessibility basics: focus, labels, contrast, reduced motion where relevant, and error states.
- **Acceptance:** no horizontal scroll or zoom required for the core workflow on the target devices.

## Phase 3 — Installable PWA (after mobile usability)

### P-01 — Manifest, icons, install checks (P1)
- [ ] Add a valid web app manifest and appropriate icons/metadata for standalone launch.
- [ ] Confirm correct HTTPS origin, scope, start URL, and install behavior on target Android/iOS devices.
- [ ] Document Add to Home Screen steps for platforms without a browser install prompt.
- **Acceptance:** app installs and launches with recognizable identity and correct navigation.

### P-02 — Service worker and update behavior (P1, depends on P-01)
- [ ] Add a service worker with a deliberately limited caching strategy and reliable update flow.
- [ ] Do not cache private API responses or promise offline writes without a reviewed data protection/sync design.
- [ ] Test install, reload, upgrade, offline messaging, and logout/session behavior.
- **Acceptance:** installing and updating does not strand users on stale frontend assets or expose private data.

## Phase 4 — Notifications and progress summaries (exploratory)

### N-01 — Notification product/design spike (P2)
- [ ] Agree on reminder events, daily/weekly report cadence, time zone, opt-in UX, and data definitions.
- [ ] Identify existing weekly report fields to reuse: completed, required, outstanding, missed scheduled.
- [ ] Confirm target device/browser compatibility and the iOS Home Screen requirement.
- **Acceptance:** short technical design with notification examples and edge cases; no implementation implied.

### N-02 — Web Push delivery and preferences (P2, depends on N-01 and P-02)
- [ ] Add a user-triggered permission request and per-device subscribe/unsubscribe UX.
- [ ] Store endpoint/subscription data securely; protect subscription APIs and remove expired subscriptions.
- [ ] Choose VAPID key management and a server-side scheduled delivery mechanism.
- [ ] Avoid duplicate sends, respect user schedule/quiet hours, and make errors observable.
- **Acceptance:** opted-in devices receive a test notification and can reliably disable it.

### N-03 — Scheduled summary/report notifications (P2, depends on N-02)
- [ ] Reuse server-side weekly progress calculations; document counts so a report does not conflate incomplete targets with missed fixed days.
- [ ] Send an agreed progress digest and selected due-task reminders without requiring the app tab to be open.
- [ ] Verify DST, boundary dates, retries, opt-out, and best-effort delivery limitations.
- **Acceptance:** user-approved report examples match in-app reporting and production delivery is observable.

## Suggested implementation PR sequence

1. **Security/deployment decisions + API boundary** — H-01, H-04 design and initial safeguards.
2. **Neon schema + persistence** — H-02, H-03.
3. **Render + Vercel deployment** — H-05, H-06, H-07.
4. **Runbook + production verification** — H-08.
5. **Mobile audit + fixes** — M-01, M-02.
6. **Installable PWA** — P-01, P-02.
7. **Push feasibility, subscriptions, and reports** — N-01 through N-03 (split further when scoped).

No dates or assignees are implied by this checklist. Review and assign work before execution.