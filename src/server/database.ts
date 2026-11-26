import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  Completion,
  CreateTaskInput,
  DatabaseFile,
  Task,
  UpdateTaskInput,
} from "../shared/types.js";

const EMPTY_DATABASE: DatabaseFile = {
  version: 1,
  tasks: [],
  completions: [],
};

interface TaskRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weekly_frequency: number;
  assigned_days: number[];
  created_at: Date;
  updated_at: Date;
}

interface CompletionRow {
  id: string;
  task_id: string;
  date_key: string;
  completed_at: Date;
}

export class Database {
  private state: DatabaseFile = structuredClone(EMPTY_DATABASE);
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly pool: Pool | undefined;

  public constructor(private readonly filePath: string, databaseUrl = process.env.DATABASE_URL) {
    if (databaseUrl) {
      this.pool = new Pool({ connectionString: databaseUrl });
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is required in production.");
    }
  }

  public async init(): Promise<void> {
    if (this.pool) {
      await this.pool.query("SELECT id FROM tasks LIMIT 0");
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(contents) as Partial<DatabaseFile>;
      this.state = {
        version: 1,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        completions: Array.isArray(parsed.completions) ? parsed.completions : [],
      };
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
      await this.persist();
    }
  }

  public async getSnapshot(): Promise<DatabaseFile> {
    if (!this.pool) return structuredClone(this.state);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const [tasksResult, completionsResult] = await Promise.all([
        client.query<TaskRow>(
          `SELECT id, name, description, enabled, weekly_frequency, assigned_days,
                  created_at, updated_at
           FROM tasks ORDER BY created_at, id`,
        ),
        client.query<CompletionRow>(
          `SELECT id, task_id, date_key::text, completed_at
           FROM completions ORDER BY completed_at, id`,
        ),
      ]);
      await client.query("COMMIT");
      return {
        version: 1,
        tasks: tasksResult.rows.map(mapTask),
        completions: completionsResult.rows.map(mapCompletion),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async findTask(id: string): Promise<Task | undefined> {
    if (!this.pool) return this.state.tasks.find((task) => task.id === id);

    const result = await this.pool.query<TaskRow>(
      `SELECT id, name, description, enabled, weekly_frequency, assigned_days,
              created_at, updated_at
       FROM tasks WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapTask(result.rows[0]) : undefined;
  }

  public async hasCompletion(taskId: string, dateKey: string): Promise<boolean> {
    if (!this.pool) {
      return this.state.completions.some(
        (completion) => completion.taskId === taskId && completion.dateKey === dateKey,
      );
    }

    const result = await this.pool.query(
      "SELECT 1 FROM completions WHERE task_id = $1 AND date_key = $2::date LIMIT 1",
      [taskId, dateKey],
    );
    return result.rowCount !== 0;
  }

  public async createTask(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? "",
      enabled: input.enabled ?? true,
      weeklyFrequency: input.weeklyFrequency,
      assignedDays: input.assignedDays ?? [],
      createdAt: now,
      updatedAt: now,
    };

    if (this.pool) {
      const result = await this.pool.query<TaskRow>(
        `INSERT INTO tasks
           (id, name, description, enabled, weekly_frequency, assigned_days, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, description, enabled, weekly_frequency, assigned_days,
                   created_at, updated_at`,
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
      return mapTask(result.rows[0]);
    }

    this.state.tasks.push(task);
    await this.persist();
    return task;
  }

  public async updateTask(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
    const task = await this.findTask(id);
    if (!task) return undefined;

    Object.assign(task, input, { updatedAt: new Date().toISOString() });
    if (this.pool) {
      const result = await this.pool.query<TaskRow>(
        `UPDATE tasks
         SET name = $2, description = $3, enabled = $4, weekly_frequency = $5,
             assigned_days = $6, updated_at = $7
         WHERE id = $1
         RETURNING id, name, description, enabled, weekly_frequency, assigned_days,
                   created_at, updated_at`,
        [
          id,
          task.name,
          task.description,
          task.enabled,
          task.weeklyFrequency,
          task.assignedDays,
          task.updatedAt,
        ],
      );
      return result.rows[0] ? mapTask(result.rows[0]) : undefined;
    }

    const stateTask = this.state.tasks.find((item) => item.id === id);
    if (!stateTask) return undefined;
    Object.assign(stateTask, task);
    await this.persist();
    return stateTask;
  }

  public async deleteTask(id: string): Promise<boolean> {
    if (this.pool) {
      const result = await this.pool.query("DELETE FROM tasks WHERE id = $1", [id]);
      return result.rowCount !== 0;
    }

    const taskIndex = this.state.tasks.findIndex((task) => task.id === id);
    if (taskIndex < 0) return false;

    this.state.tasks.splice(taskIndex, 1);
    this.state.completions = this.state.completions.filter((completion) => completion.taskId !== id);
    await this.persist();
    return true;
  }

  public async addCompletion(taskId: string, dateKey: string): Promise<Completion> {
    const completion: Completion = {
      id: randomUUID(),
      taskId,
      dateKey,
      completedAt: new Date().toISOString(),
    };

    if (this.pool) {
      const result = await this.pool.query<CompletionRow>(
        `INSERT INTO completions (id, task_id, date_key, completed_at)
         VALUES ($1, $2, $3::date, $4)
         RETURNING id, task_id, date_key::text, completed_at`,
        [completion.id, completion.taskId, completion.dateKey, completion.completedAt],
      );
      return mapCompletion(result.rows[0]);
    }

    this.state.completions.push(completion);
    await this.persist();
    return completion;
  }

  public async removeLatestCompletion(taskId: string, dateKey: string): Promise<boolean> {
    if (this.pool) {
      const result = await this.pool.query(
        `DELETE FROM completions
         WHERE id = (
           SELECT id FROM completions
           WHERE task_id = $1 AND date_key = $2::date
           ORDER BY completed_at DESC, id DESC
           LIMIT 1
         )
         RETURNING id`,
        [taskId, dateKey],
      );
      return result.rowCount !== 0;
    }

    for (let index = this.state.completions.length - 1; index >= 0; index -= 1) {
      const completion = this.state.completions[index];
      if (completion.taskId === taskId && completion.dateKey === dateKey) {
        this.state.completions.splice(index, 1);
        await this.persist();
        return true;
      }
    }

    return false;
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.state, null, 2);
    const temporaryPath = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await writeFile(temporaryPath, snapshot, "utf8");
      await rename(temporaryPath, this.filePath);
    });
    await this.writeQueue;
  }
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    weeklyFrequency: row.weekly_frequency,
    assignedDays: row.assigned_days,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapCompletion(row: CompletionRow): Completion {
  return {
    id: row.id,
    taskId: row.task_id,
    dateKey: row.date_key,
    completedAt: row.completed_at.toISOString(),
  };
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
