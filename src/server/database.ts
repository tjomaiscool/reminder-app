import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
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

export class Database {
  private state: DatabaseFile = structuredClone(EMPTY_DATABASE);
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {}

  public async init(): Promise<void> {
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

  public get tasks(): Task[] {
    return this.state.tasks;
  }

  public get completions(): Completion[] {
    return this.state.completions;
  }

  public findTask(id: string): Task | undefined {
    return this.state.tasks.find((task) => task.id === id);
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

    this.state.tasks.push(task);
    await this.persist();
    return task;
  }

  public async updateTask(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
    const task = this.findTask(id);
    if (!task) return undefined;

    Object.assign(task, input, { updatedAt: new Date().toISOString() });
    await this.persist();
    return task;
  }

  public async deleteTask(id: string): Promise<boolean> {
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

    this.state.completions.push(completion);
    await this.persist();
    return completion;
  }

  public async removeLatestCompletion(taskId: string, dateKey: string): Promise<boolean> {
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

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
