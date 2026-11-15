# Cadence — product and delivery roadmap

**Status:** proposal for review · **Scope:** deployment planning; Neon persistence is implemented locally but not yet provisioned or verified against a Neon project

## Vision

Turn Cadence from a single-machine recurring-task tracker into a privately accessible, hosted, mobile-friendly, installable Progressive Web App (PWA). Once the hosted app is stable and usable on phones, add opt-in push reminders and progress reports about planned versus completed work.

The near-term goal is **a usable hosted application**, not a native iOS/Android app.

## What exists today (verified in the repository)

- TypeScript browser client in `src/client/main.ts`; HTML/CSS under `public/`.
- Node.js HTTP server in `src/server/server.ts` serves both the API and static assets on `127.0.0.1`, using `PORT` (default `4173`).
- PostgreSQL persistence through `pg` when `DATABASE_URL` is set, with JSON-file persistence retained for local development.
- A versioned schema migration and a validated, one-time JSON import command.
- Today, Admin, and Reports views; current-week and historical completion data.
- Responsive CSS breakpoints exist, but mobile usability has not yet been validated on actual devices.
- No user accounts, authentication, web app manifest, service worker, push subscription flow, or production deployment configuration is documented in the current repository.
- The client calls relative `/api/*` routes. The backend has a permissive `Access-Control-Allow-Origin: *` response header.

**Consequences:** a Vercel + Render deployment needs an explicit frontend/API boundary; a hosted Render process must listen on `0.0.0.0:$PORT`; Render must use Neon rather than the local JSON fallback; and public access must not expose personal task data or unauthenticated write endpoints.

## Proposed production shape

```text
Phone / desktop browser
    |
    | HTTPS
    v
Vercel — static frontend (HTML, CSS, compiled TypeScript)
    |
    | /api/* via a verified Vercel rewrite to Render
    |   OR a configured API base URL + restricted CORS
    v
Render — long-running Node.js HTTP API
    |
    | TLS PostgreSQL connection (server-side only)
    v
Neon — managed PostgreSQL (tasks and completion history)

Later: Vercel-origin service worker <-> Push API / subscriptions
       Render API + scheduled job -> Web Push delivery
```

- **Vercel** hosts browser assets; it is not the database or background scheduler.
- **Render** hosts the Node.js API and handles authorization. Health checks and logs are part of the deployment.
- **Neon** hosts durable PostgreSQL tables. Keep credentials in Render secrets, never in browser code or Git.
- **API routing decision:** Prefer keeping the current `/api/*` client contract using an appropriate Vercel rewrite, after verifying rewrite behavior and security. Otherwise configure a build-time API base URL and narrowly scoped CORS. Never combine credentialed requests with `Access-Control-Allow-Origin: *`.
- **Authentication decision:** This is presently a single-user app with no accounts. Before making the backend publicly reachable with live data, choose and implement a minimal authenticated access model. Do not rely on an obscure URL, permissive CORS, or the app being “for one person” for protection.

## Phases (in order)

### Phase 1 — Host the application (highest priority)

**Outcome:** the existing Today / Admin / Reports workflow works through a stable HTTPS URL with data stored in Neon, not on a local disk.

1. Agree on access control for a private, initially single-user production deployment.
2. Define a PostgreSQL schema, migration process, and safe path from `data/db.json` without losing dates, task IDs, or completion history. Preserve local development ergonomics.
3. Separate the static frontend build from the Node API runtime while preserving the existing `/api/*` behavior.
4. Deploy the Node API to Render, bind to `0.0.0.0` and `PORT`, configure secrets and `APP_TIME_ZONE` explicitly, and verify `/api/health`.
5. Provision Neon and connect the API using server-side credentials; apply schema migrations using an appropriate direct connection. Use a pooled connection only if the selected runtime/driver needs it.
6. Deploy the frontend to Vercel, publish a deterministic static output directory, and establish routing to the Render API.
7. Test the complete create / edit / complete / undo / report workflow in production, including a restart or redeploy persistence check.
8. Document environment variables, deployments, backups, restore procedure, and minimum operational monitoring.

**Release gate:** No public deployment with unrestricted task write endpoints or personal data. The current file database must not be treated as durable storage on ephemeral hosting.

**Done when:** a device outside the developer's machine can open the authenticated app over HTTPS, use the main workflows, and see the same data after a Render restart or redeploy. No DB secrets are exposed to the client.

### Phase 2 — Validate and improve the mobile experience

**Outcome:** Today, Admin, and Reports are comfortably usable at phone widths before pursuing installation.

1. Audit the current responsive layout (existing CSS contains `max-width: 860px` and `620px` rules) on small screens and real devices.
2. Prioritize Today: task visibility, tap targets, completion actions, and readable progress; then review editing forms and week-by-week reports.
3. Fix any horizontal overflow, keyboard/form problems, dense navigation, inaccessible controls, and safe-area issues.
4. Verify mobile performance, loading/error states, readability, and core accessibility behaviors.

**Done when:** a phone user can create a task, mark it complete, undo it, and read weekly results without zooming, horizontal scrolling, or desktop-only interaction.

### Phase 3 — Make Cadence installable as a PWA

**Outcome:** the hosted web app can be added to a phone's Home Screen and launched in a standalone app-like experience.

1. Add an app manifest (`name`, short name, icons, start URL, display mode, colors) and suitable icon assets.
2. Serve over HTTPS; introduce a correctly scoped service worker as needed for push and optional safe asset caching.
3. Verify installation and standalone launch on Android and iOS/iPadOS (Home Screen installation is a different flow on Apple devices).
4. Decide what offline behavior, if any, is actually supported. Do not imply that task edits sync offline unless an explicit queuing/synchronization design exists.
5. Check navigation, updates, and cache invalidation after a new Vercel deployment.

**Done when:** Cadence can be installed and launched from a supported device's Home Screen, works online with the hosted API, and communicates any offline limitations clearly.

### Phase 4 — Push notifications and progress reports (deliberately high level)

**Outcome:** on opted-in devices, Cadence can send useful reminders and summaries of completed and outstanding planned work.

Potential capabilities:

- Time- or event-driven reminders (for example, unfinished due tasks) with user-configurable timing.
- Daily or weekly progress digest: planned target, completed count, remaining count, and missed fixed-day items, using existing reporting/domain semantics.
- Explicit per-device opt-in/opt-out, permission handling, and subscription management.
- Server-side scheduling, retries, delivery logs, and duplicate suppression; no dependence on a browser tab remaining open.
- Respect the configured user time zone and notification quiet hours.

**Later design decisions:** reminder cadence, exact report wording/metrics, scheduler approach (Render cron/worker or another service), device targeting, retention policy, and notification preferences. No provider or precise trigger set is selected by this roadmap.

**Platform note:** Web Push requires a service worker, supported browser/platform, secure origin, and permission. On iOS/iPadOS 16.4+ the push-permission flow applies to Home Screen web apps and must follow a user interaction. Notification delivery is best-effort; the product must remain useful without it.

## Milestone dependencies

```text
Phase 1: durable database + protected hosted API + hosted frontend
   -> Phase 2: mobile UX validation
      -> Phase 3: installable PWA
         -> Phase 4: opted-in push + scheduled reports
```

An early mobile design spike is fine during Phase 1, but it does not replace finishing the hosted end-to-end workflow.

## Out of scope for the first PRs

Native mobile apps, multi-user sharing, elaborate analytics, payments, real-time collaboration, and a fully offline writable data model. Avoid replatforming the UI framework merely to deploy: the current TypeScript client can be hosted as static assets.

## Decisions to record before implementation

- [ ] Confirm whether the first hosted release is strictly single-user or needs multiple distinct accounts.
- [ ] Choose authentication and access policy before exposing task APIs.
- [x] Choose Neon migration tooling/schema library and the import strategy for existing JSON data (`pg`, checked-in SQL migration, validated transactional JSON importer).
- [ ] Choose same-origin Vercel rewrite vs explicit cross-origin API URL.
- [ ] Confirm staging vs production environment separation and ownership of Vercel, Render, and Neon projects.
- [ ] Confirm data backup/restore expectations and an initial supported mobile-device matrix.

See [TASKS.md](TASKS.md) for implementation-ready work items and acceptance criteria, and [AGENTS.md](../AGENTS.md) for contributor/agent instructions.

## References

- [Vercel build/output configuration](https://vercel.com/docs/builds/configure-a-build)
- [Render web services and port binding](https://render.com/docs/web-services)
- [Neon connection pooling and migration considerations](https://neon.com/docs/connect/connection-pooling)
- [MDN: making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [WebKit: Web Push for Home Screen apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)