export type TaskCategory = "must" | "optional" | "other";

export interface Task {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weeklyFrequency: number;
  assignedDays: number[];
  createdAt: string;
  updatedAt: string;
}

export interface Completion {
  id: string;
  taskId: string;
  dateKey: string;
  completedAt: string;
}

export interface DatabaseFile {
  version: 1;
  tasks: Task[];
  completions: Completion[];
}

export interface TaskView extends Task {
  completedCount: number;
  completedToday: boolean;
  category: TaskCategory;
  remainingRequired: number;
  remainingOpportunities: number;
  scheduleLabel: string;
  statusLabel: string;
}

export interface TodayResponse {
  today: string;
  dayIndex: number;
  weekStart: string;
  weekEnd: string;
  lanes: {
    must: TaskView[];
    optional: TaskView[];
    other: TaskView[];
  };
  previousDays: PreviousDayItem[];
  summary: {
    activeTasks: number;
    mustCount: number;
    optionalCount: number;
    otherCount: number;
    completedOccurrences: number;
    requiredOccurrences: number;
    progressPercentage: number;
  };
}

export interface PreviousDayItem {
  taskId: string;
  taskName: string;
  description: string;
  dateKey: string;
  dayLabel: string;
  scheduleLabel: string;
}

export interface WeeklyReportOccurrence {
  taskId: string;
  taskName: string;
  dateKey: string;
  dayLabel: string;
  completed: boolean;
  canEdit: boolean;
}

export interface WeeklyReportDay {
  dateKey: string;
  dayIndex: number;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isFuture: boolean;
  occurrences: WeeklyReportOccurrence[];
}

export interface WeeklyReportTask {
  taskId: string;
  taskName: string;
  description: string;
  enabled: boolean;
  weeklyFrequency: number;
  assignedDays: number[];
  scheduleLabel: string;
  completedCount: number;
  completedDates: string[];
  requiredCount: number;
  progressPercentage: number;
  outstandingCount: number;
}

export interface WeeklyReportResponse {
  weekStart: string;
  weekEnd: string;
  currentWeekStart: string;
  isCurrentWeek: boolean;
  previousWeekStart: string;
  nextWeekStart: string | null;
  days: WeeklyReportDay[];
  tasks: WeeklyReportTask[];
  summary: {
    activeTasks: number;
    completedOccurrences: number;
    requiredOccurrences: number;
    outstandingOccurrences: number;
    missedScheduledOccurrences: number;
    completionRate: number;
  };
}

export interface AdminTaskView extends Task {
  completedCount: number;
  completedToday: boolean;
  scheduleLabel: string;
  statusLabel: string;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  enabled?: boolean;
  weeklyFrequency: number;
  assignedDays?: number[];
}

export interface UpdateTaskInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  weeklyFrequency?: number;
  assignedDays?: number[];
}
