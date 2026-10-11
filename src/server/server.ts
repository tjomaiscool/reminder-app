import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "./database.js";
import {
  getAdminTaskViews,
  getTodayKey,
  getTodayResponse,
  getWeeklyReport,
  isDateKey,
  normalizeTaskInput,
} from "./domain.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const publicDirectory = join(projectRoot, "public");
const clientDirectory = join(projectRoot, "dist", "client");
const database = new Database(join(projectRoot, "data", "db.json"));
const port = Number(process.env.PORT ?? 4173);

await database.init();

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (!(error instanceof HttpError)) console.error(error);
    if (!response.headersSent) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message = error instanceof HttpError ? error.message : "Something went wrong on the server.";
      sendJson(response, statusCode, { error: message });
    } else {
      response.destroy();
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Cadence is running at http://localhost:${port}`);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, null);
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, requestUrl);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  await serveStatic(requestUrl.pathname, response, request.method === "HEAD");
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
): Promise<void> {
  const pathParts = requestUrl.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/today") {
    sendJson(response, 200, getTodayResponse(toDatabaseFile()));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/reports") {
    const requestedWeekStart = requestUrl.searchParams.get("weekStart") ?? undefined;
    try {
      sendJson(response, 200, getWeeklyReport(toDatabaseFile(), requestedWeekStart));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Invalid report week.");
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/tasks") {
    const today = getTodayKey();
    sendJson(response, 200, { today, tasks: getAdminTaskViews(toDatabaseFile(), today) });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/tasks") {
    const body = await readJsonBody(request);
    const input = parseTaskInput(body);
    const task = await database.createTask(input);
    sendJson(response, 201, { task });
    return;
  }

  if (pathParts[0] !== "api" || pathParts[1] !== "tasks" || !pathParts[2]) {
    sendJson(response, 404, { error: "API route not found." });
    return;
  }

  const taskId = decodeURIComponent(pathParts[2]);
  const task = database.findTask(taskId);
  if (!task) {
    sendJson(response, 404, { error: "Task not found." });
    return;
  }

  if (pathParts[3] === "completions" && pathParts[4] === "today") {
    const today = getTodayKey();
    if (request.method === "POST") {
      const alreadyCompleted = database.completions.some(
        (completion) => completion.taskId === taskId && completion.dateKey === today,
      );
      if (!alreadyCompleted) await database.addCompletion(taskId, today);
      sendJson(response, 200, getTodayResponse(toDatabaseFile(), today));
      return;
    }

    if (request.method === "DELETE") {
      await database.removeLatestCompletion(taskId, today);
      sendJson(response, 200, getTodayResponse(toDatabaseFile(), today));
      return;
    }
  }

  if (pathParts[3] === "completions" && pathParts.length === 4 && request.method === "POST") {
    const body = await readJsonBody(request);
    const dateKey = getCompletionDate(body);
    await assertCompletableDate(dateKey);
    const alreadyCompleted = database.completions.some(
      (completion) => completion.taskId === taskId && completion.dateKey === dateKey,
    );
    const completion = alreadyCompleted ? null : await database.addCompletion(taskId, dateKey);
    sendJson(response, 200, { completion });
    return;
  }

  if (pathParts[3] === "completions" && pathParts.length === 5 && request.method === "DELETE") {
    const dateKey = decodeURIComponent(pathParts[4]);
    await assertCompletableDate(dateKey);
    const removed = await database.removeLatestCompletion(taskId, dateKey);
    sendJson(response, 200, { removed });
    return;
  }

  if (pathParts.length === 3 && request.method === "PATCH") {
    const body = await readJsonBody(request);
    const input = parseTaskInput(body, task);
    const updatedTask = await database.updateTask(taskId, input);
    sendJson(response, 200, { task: updatedTask });
    return;
  }

  if (pathParts.length === 3 && request.method === "DELETE") {
    await database.deleteTask(taskId);
    sendJson(response, 204, null);
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(pathname: string, response: ServerResponse, headOnly: boolean): Promise<void> {
  const isClientAsset = pathname.startsWith("/client/");
  const baseDirectory = isClientAsset ? clientDirectory : publicDirectory;
  const requestedPath = isClientAsset ? pathname.slice("/client/".length) : pathname === "/" ? "index.html" : pathname.slice(1);
  const targetPath = safeResolve(baseDirectory, requestedPath);

  try {
    const content = await readFile(targetPath);
    response.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": getContentType(targetPath),
      "content-length": content.byteLength,
    });
    if (!headOnly) response.end(content);
    else response.end();
  } catch (error: unknown) {
    if (isFileNotFound(error)) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    throw error;
  }
}

function toDatabaseFile() {
  return {
    version: 1 as const,
    tasks: database.tasks,
    completions: database.completions,
  };
}

function safeResolve(baseDirectory: string, requestedPath: string): string {
  const targetPath = resolve(baseDirectory, requestedPath);
  const relativePath = relative(baseDirectory, targetPath);
  if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || resolve(baseDirectory, relativePath) !== targetPath) {
    throw new Error("Unsafe static path.");
  }
  return targetPath;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1_000_000) throw new HttpError(413, "Request body is too large.");
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = payload === null ? "" : JSON.stringify(payload);
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
  });
  response.end(body);
}

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

class HttpError extends Error {
  public constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

function parseTaskInput(body: unknown, existing?: Parameters<typeof normalizeTaskInput>[1]) {
  try {
    return normalizeTaskInput(body, existing);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid task settings.");
  }
}

function getCompletionDate(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "A completion date is required.");
  }
  const dateKey = (body as { dateKey?: unknown }).dateKey;
  if (typeof dateKey !== "string" || !isDateKey(dateKey)) {
    throw new HttpError(400, "Completion date must use YYYY-MM-DD format.");
  }
  return dateKey;
}

async function assertCompletableDate(dateKey: string): Promise<void> {
  if (!isDateKey(dateKey)) throw new HttpError(400, "Completion date must use YYYY-MM-DD format.");
  if (dateKey > getTodayKey()) throw new HttpError(400, "Future completions cannot be added.");
}
