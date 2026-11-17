import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { isDateKey } from "./domain.js";
import type { Completion, DatabaseFile, Task } from "../shared/types.js";

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set MIGRATION_DATABASE_URL (direct Neon connection) or DATABASE_URL before importing.");
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputPath = process.argv[2] ? resolve(process.argv[2]) : join(projectRoot, "data", "db.json");
const pool = new Pool({ connectionString });

try {
  const database = parseDatabaseFile(JSON.parse(await readFile(inputPath, "utf8")) as unknown);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const migration = await client.query(
      "SELECT 1 FROM schema_migrations WHERE migration_id = $1",
      ["001_initial_schema"],
    );
    if (!migration.rowCount) throw new Error("Apply the database migration before importing data.");

    const counts = await client.query<{ task_count: string; completion_count: string }>(
      `SELECT
         (SELECT count(*) FROM tasks) AS task_count,
         (SELECT count(*) FROM completions) AS completion_count`,
    );
    if (Number(counts.rows[0].task_count) || Number(counts.rows[0].completion_count)) {
      throw new Error("The Neon database is not empty; import was stopped without changing any data.");
    }

    for (const task of database.tasks) {
      await client.query(
        `INSERT INTO tasks
           (id, name, description, enabled, weekly_frequency, assigned_days, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          task.id,
          task.name,
          task.description,
          task.enabled,
          task.weeklyFrequency,
          task.assignedDays,
          task.createdAt,
          task.updatedAt,
        ],
      );
    }

    for (const completion of database.completions) {
      await client.query(
        `INSERT INTO completions (id, task_id, date_key, completed_at)
         VALUES ($1, $2, $3::date, $4)`,
        [completion.id, completion.taskId, completion.dateKey, completion.completedAt],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${database.tasks.length} tasks and ${database.completions.length} completions.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error("JSON import failed.", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

function parseDatabaseFile(value: unknown): DatabaseFile {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.completions)) {
    throw new Error("The JSON file must be a version 1 database with task and completion arrays.");
  }

  const tasks = value.tasks.map(parseTask);
  const taskIds = new Set(tasks.map((task) => task.id));
  const completions = value.completions.map((item) => parseCompletion(item, taskIds));
  return { version: 1, tasks, completions };
}

function parseTask(value: unknown): Task {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.description) ||
    typeof value.enabled !== "boolean" ||
    !Number.isInteger(value.weeklyFrequency) ||
    !Array.isArray(value.assignedDays) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt)
  ) {
    throw new Error("A task has invalid or missing fields.");
  }
  const assignedDays = value.assignedDays;
  if (
    value.id.length === 0 ||
    value.name.trim().length === 0 ||
    value.name.length > 120 ||
    value.description.length > 400 ||
    Number(value.weeklyFrequency) < 1 ||
    Number(value.weeklyFrequency) > 7 ||
    assignedDays.some((day) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6) ||
    new Set(assignedDays).size !== assignedDays.length ||
    (assignedDays.length > 0 && Number(value.weeklyFrequency) > assignedDays.length)
  ) {
    throw new Error(`Task ${value.id} violates database constraints.`);
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    enabled: value.enabled,
    weeklyFrequency: Number(value.weeklyFrequency),
    assignedDays: assignedDays.map(Number),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseCompletion(value: unknown, taskIds: Set<string>): Completion {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.taskId) ||
    !isString(value.dateKey) ||
    !isTimestamp(value.completedAt) ||
    value.id.length === 0 ||
    !taskIds.has(value.taskId) ||
    !isDateKey(value.dateKey)
  ) {
    throw new Error("A completion has invalid fields or references a missing task.");
  }
  return {
    id: value.id,
    taskId: value.taskId,
    dateKey: value.dateKey,
    completedAt: value.completedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return isString(value) && value.length > 0 && Number.isFinite(Date.parse(value));
}
