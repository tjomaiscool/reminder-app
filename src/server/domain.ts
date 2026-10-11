import type {
  AdminTaskView,
  Completion,
  CreateTaskInput,
  DatabaseFile,
  PreviousDayItem,
  Task,
  TaskView,
  TodayResponse,
  WeeklyReportResponse,
} from "../shared/types.js";

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Europe/Copenhagen";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function getTodayKey(now = new Date()): string {
  return datePartsToKey(getDateParts(now));
}

export function getDateParts(date: Date): DateParts {
  const parts = DATE_PARTS_FORMATTER.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function datePartsToKey(parts: DateParts): string {
  return [parts.year, parts.month, parts.day]
    .map((part, index) => (index === 0 ? String(part).padStart(4, "0") : String(part).padStart(2, "0")))
    .join("-");
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return datePartsToKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function getDayIndex(dateKey: string): number {
  const sundayBasedIndex = parseDateKey(dateKey).getUTCDay();
  return (sundayBasedIndex + 6) % 7;
}

export function getWeekBounds(todayKey: string): { start: string; end: string } {
  const start = addDays(todayKey, -getDayIndex(todayKey));
  return { start, end: addDays(start, 6) };
}

export function formatDateLabel(dateKey: string): string {
  return DATE_LABEL_FORMATTER.format(parseDateKey(dateKey));
}

export function getTaskScheduleLabel(task: Pick<Task, "assignedDays" | "weeklyFrequency">): string {
  if (task.assignedDays.length === 0) {
    return `Any day · ${task.weeklyFrequency}× / week`;
  }

  if (task.assignedDays.length === 7) return "Every day";

  return task.assignedDays.map((day) => DAY_LABELS[day] ?? "?").join(", ");
}

export function getTaskCompletions(
  taskId: string,
  completions: Completion[],
  weekStart: string,
  weekEnd: string,
): Completion[] {
  return completions.filter(
    (completion) =>
      completion.taskId === taskId &&
      completion.dateKey >= weekStart &&
      completion.dateKey <= weekEnd,
  );
}

export function getTaskView(
  task: Task,
  completions: Completion[],
  todayKey: string,
): TaskView {
  const { start: weekStart, end: weekEnd } = getWeekBounds(todayKey);
  const taskCompletions = getTaskCompletions(task.id, completions, weekStart, weekEnd);
  const completedCount = taskCompletions.length;
  const completedToday = taskCompletions.some((completion) => completion.dateKey === todayKey);
  const remainingRequired = Math.max(task.weeklyFrequency - completedCount, 0);
  const dayIndex = getDayIndex(todayKey);
  const remainingOpportunities =
    task.assignedDays.length === 0
      ? 7 - dayIndex
      : task.assignedDays.filter((day) => day >= dayIndex).length;

  let category: TaskView["category"] = "other";
  if (task.enabled && remainingRequired > 0) {
    if (task.assignedDays.length > 0) {
      if (task.assignedDays.includes(dayIndex)) category = "must";
    } else if (remainingRequired >= remainingOpportunities) {
      category = "must";
    } else {
      category = "optional";
    }
  }

  let statusLabel = "Goal met";
  if (remainingRequired > 0) {
    if (category === "must") {
      statusLabel = task.assignedDays.length > 0 ? "Due today" : "Last opportunity today";
    } else if (category === "optional") {
      statusLabel = `${remainingRequired} left this week`;
    } else if (task.assignedDays.length > 0) {
      const nextDay = task.assignedDays.find((day) => day > dayIndex);
      statusLabel = nextDay === undefined ? "Carryover item" : `Next on ${DAY_LABELS[nextDay]}`;
    } else {
      statusLabel = `${remainingRequired} left this week`;
    }
  }

  return {
    ...task,
    completedCount,
    completedToday,
    category,
    remainingRequired,
    remainingOpportunities,
    scheduleLabel: getTaskScheduleLabel(task),
    statusLabel,
  };
}

export function getTodayResponse(database: DatabaseFile, todayKey = getTodayKey()): TodayResponse {
  const { start: weekStart, end: weekEnd } = getWeekBounds(todayKey);
  const dayIndex = getDayIndex(todayKey);
  const activeViews = database.tasks
    .filter((task) => task.enabled)
    .map((task) => getTaskView(task, database.completions, todayKey));

  const lanes = {
    must: activeViews.filter((task) => task.category === "must"),
    optional: activeViews.filter((task) => task.category === "optional"),
    other: activeViews.filter((task) => task.category === "other"),
  };

  lanes.must.sort(sortByUrgency);
  lanes.optional.sort(sortByUrgency);
  lanes.other.sort((a, b) => a.name.localeCompare(b.name));

  const requiredOccurrences = activeViews.reduce((total, task) => total + task.weeklyFrequency, 0);
  const completedOccurrences = activeViews.reduce(
    (total, task) => total + Math.min(task.completedCount, task.weeklyFrequency),
    0,
  );

  return {
    today: todayKey,
    dayIndex,
    weekStart,
    weekEnd,
    lanes,
    previousDays: getPreviousDayItems(database, todayKey),
    summary: {
      activeTasks: activeViews.length,
      mustCount: lanes.must.length,
      optionalCount: lanes.optional.length,
      otherCount: lanes.other.length,
      completedOccurrences,
      requiredOccurrences,
      progressPercentage:
        requiredOccurrences === 0 ? 0 : Math.round((completedOccurrences / requiredOccurrences) * 100),
    },
  };
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDateKey(value);
  return !Number.isNaN(date.getTime()) && datePartsToKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }) === value;
}

export function getPreviousDayItems(database: DatabaseFile, todayKey = getTodayKey()): PreviousDayItem[] {
  const { start: weekStart } = getWeekBounds(todayKey);
  const todayIndex = getDayIndex(todayKey);
  const previousItems: PreviousDayItem[] = [];

  for (const task of database.tasks.filter((item) => item.enabled && item.assignedDays.length > 0)) {
    const taskCompletions = getTaskCompletions(task.id, database.completions, weekStart, addDays(weekStart, 6));
    const completedDates = new Set(taskCompletions.map((completion) => completion.dateKey));

    for (let dayIndex = 0; dayIndex < todayIndex; dayIndex += 1) {
      if (!task.assignedDays.includes(dayIndex)) continue;
      const dateKey = addDays(weekStart, dayIndex);
      if (completedDates.has(dateKey)) continue;
      previousItems.push({
        taskId: task.id,
        taskName: task.name,
        description: task.description,
        dateKey,
        dayLabel: `${DAY_LABELS[dayIndex]} · ${formatMonthDay(dateKey)}`,
        scheduleLabel: getTaskScheduleLabel(task),
      });
    }
  }

  return previousItems.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    return a.taskName.localeCompare(b.taskName);
  });
}

export function getWeeklyReport(
  database: DatabaseFile,
  requestedWeekStart = getWeekBounds(getTodayKey()).start,
  todayKey = getTodayKey(),
): WeeklyReportResponse {
  const currentWeekStart = getWeekBounds(todayKey).start;
  if (!isDateKey(requestedWeekStart) || getDayIndex(requestedWeekStart) !== 0) {
    throw new Error("Reports must start on a Monday.");
  }
  if (requestedWeekStart > currentWeekStart) {
    throw new Error("Future weeks are not available yet.");
  }

  const weekStart = requestedWeekStart;
  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = weekStart === currentWeekStart;
  const reportTasks = database.tasks
    .map((task) => getWeeklyReportTask(task, database.completions, weekStart, weekEnd))
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return Number(b.enabled) - Number(a.enabled);
      return a.taskName.localeCompare(b.taskName);
    });

  const days = Array.from({ length: 7 }, (_, dayIndex) => {
    const dateKey = addDays(weekStart, dayIndex);
    const occurrences = database.tasks
      .filter((task) => task.assignedDays.includes(dayIndex))
      .map((task) => {
        const completed = database.completions.some(
          (completion) => completion.taskId === task.id && completion.dateKey === dateKey,
        );
        return {
          taskId: task.id,
          taskName: task.name,
          dateKey,
          dayLabel: DAY_LABELS[dayIndex],
          completed,
          canEdit: dateKey <= todayKey,
        };
      })
      .sort((a, b) => a.taskName.localeCompare(b.taskName));

    return {
      dateKey,
      dayIndex,
      dayLabel: DAY_LABELS[dayIndex],
      dateLabel: formatMonthDay(dateKey),
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      occurrences,
    };
  });

  const activeTasks = reportTasks.filter((task) => task.enabled);
  const requiredOccurrences = activeTasks.reduce((total, task) => total + task.requiredCount, 0);
  const completedOccurrences = activeTasks.reduce(
    (total, task) => total + Math.min(task.completedCount, task.requiredCount),
    0,
  );
  const missedScheduledOccurrences = activeTasks.reduce((total, task) => {
    if (task.assignedDays.length === 0) return total;
    return total + task.assignedDays.filter((dayIndex) => {
      const dateKey = addDays(weekStart, dayIndex);
      return dateKey <= todayKey && !database.completions.some(
        (completion) => completion.taskId === task.taskId && completion.dateKey === dateKey,
      );
    }).length;
  }, 0);

  return {
    weekStart,
    weekEnd,
    currentWeekStart,
    isCurrentWeek,
    previousWeekStart: addDays(weekStart, -7),
    nextWeekStart: addDays(weekStart, 7) <= currentWeekStart ? addDays(weekStart, 7) : null,
    days,
    tasks: reportTasks,
    summary: {
      activeTasks: activeTasks.length,
      completedOccurrences,
      requiredOccurrences,
      outstandingOccurrences: Math.max(requiredOccurrences - completedOccurrences, 0),
      missedScheduledOccurrences,
      completionRate:
        requiredOccurrences === 0 ? 0 : Math.round((completedOccurrences / requiredOccurrences) * 100),
    },
  };
}

function getWeeklyReportTask(
  task: Task,
  completions: Completion[],
  weekStart: string,
  weekEnd: string,
): WeeklyReportResponse["tasks"][number] {
  const taskCompletions = getTaskCompletions(task.id, completions, weekStart, weekEnd);
  const completedDates = [...new Set(taskCompletions.map((completion) => completion.dateKey))].sort();
  const completedCount = completedDates.length;
  return {
    taskId: task.id,
    taskName: task.name,
    description: task.description,
    enabled: task.enabled,
    weeklyFrequency: task.weeklyFrequency,
    assignedDays: task.assignedDays,
    scheduleLabel: getTaskScheduleLabel(task),
    completedCount,
    completedDates,
    requiredCount: task.weeklyFrequency,
    progressPercentage: Math.min(100, Math.round((completedCount / task.weeklyFrequency) * 100)),
    outstandingCount: Math.max(task.weeklyFrequency - completedCount, 0),
  };
}

function formatMonthDay(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

export function getAdminTaskViews(database: DatabaseFile, todayKey = getTodayKey()): AdminTaskView[] {
  return database.tasks
    .map((task) => {
      const view = getTaskView(task, database.completions, todayKey);
      return {
        ...task,
        completedCount: view.completedCount,
        completedToday: view.completedToday,
        scheduleLabel: view.scheduleLabel,
        statusLabel: view.statusLabel,
      };
    })
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return Number(b.enabled) - Number(a.enabled);
      return a.name.localeCompare(b.name);
    });
}

function sortByUrgency(a: TaskView, b: TaskView): number {
  if (a.completedToday !== b.completedToday) return Number(a.completedToday) - Number(b.completedToday);
  if (a.remainingRequired !== b.remainingRequired) return b.remainingRequired - a.remainingRequired;
  return a.name.localeCompare(b.name);
}

export function normalizeTaskInput(
  input: unknown,
  existing?: Pick<Task, "name" | "description" | "enabled" | "weeklyFrequency" | "assignedDays">,
): CreateTaskInput {
  if (!isRecord(input)) throw new Error("Request body must be an object.");

  const name = input.name === undefined ? existing?.name : input.name;
  const description = input.description === undefined ? existing?.description ?? "" : input.description;
  const enabled = input.enabled === undefined ? existing?.enabled ?? true : input.enabled;
  const weeklyFrequency = input.weeklyFrequency === undefined ? existing?.weeklyFrequency : input.weeklyFrequency;
  const assignedDays = input.assignedDays === undefined ? existing?.assignedDays ?? [] : input.assignedDays;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("A task name is required.");
  }
  if (name.trim().length > 120) throw new Error("Task names must be 120 characters or fewer.");
  if (typeof description !== "string") throw new Error("Description must be text.");
  if (description.length > 400) throw new Error("Descriptions must be 400 characters or fewer.");
  if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false.");
  if (!Number.isInteger(weeklyFrequency) || Number(weeklyFrequency) < 1 || Number(weeklyFrequency) > 7) {
    throw new Error("Weekly frequency must be a whole number from 1 to 7.");
  }
  if (!Array.isArray(assignedDays)) throw new Error("Assigned days must be an array.");

  const normalizedDays = [...new Set(assignedDays.map(Number))].sort((a, b) => a - b);
  if (normalizedDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Assigned days must use day indexes from 0 to 6.");
  }
  if (normalizedDays.length > 0 && Number(weeklyFrequency) > normalizedDays.length) {
    throw new Error("Weekly frequency cannot exceed the number of assigned days.");
  }

  return {
    name: name.trim(),
    description: description.trim(),
    enabled,
    weeklyFrequency: Number(weeklyFrequency),
    assignedDays: normalizedDays,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
