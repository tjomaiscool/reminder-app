# Cadence reminder app

Cadence is a personal periodic-task reminder app written entirely in TypeScript. It has:

- a Node.js HTTP server;
- a browser client compiled from TypeScript;
- a JSON file database in `data/db.json`;
- a Today view with Must Do Today, Optional Today, and Other Active Items;
- a Reports view for the current week and any past week;
- an Admin view for creating and managing recurring tasks.

There are no accounts or passwords. The app is intended for one person on one machine.

## Run it

Install dependencies and build the TypeScript source:

```bash
npm install
npm run build
npm start
```

Then open `http://localhost:4173`.

The database is created automatically the first time the server starts. It is intentionally ignored by Git so personal task data stays local.

## Reports and history

The Reports view lets you move backward through completed weeks with the week picker or previous-week button. Fixed-day tasks are shown day by day, while flexible tasks are summarized against their weekly target.

You can record a completion for any past date from a report. The Today view also shows unfinished fixed-day tasks from earlier in the current week under **From previous days**, where they can be completed directly.

## Scheduling rules

Each active task has a weekly completion target and may optionally have fixed days:

- With fixed days, the task is due on those days and remains visible as an active item if a prior scheduled day was missed.
- Without fixed days, the task can be completed on any day. It appears under Optional Today until the remaining days are no longer enough to meet its target, then moves to Must Do Today.
- Completion counts are calculated for the current Monday–Sunday week and are persisted as individual completion records.
- Historical completion records remain attached to their original date, so past reports keep their own totals when the current week changes.
