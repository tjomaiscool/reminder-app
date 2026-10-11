import type {
  AdminTaskView,
  PreviousDayItem,
  TaskView,
  TodayResponse,
  WeeklyReportResponse,
} from "../shared/types.js";

type View = "today" | "reports" | "admin";

const state: {
  view: View;
  today: TodayResponse | null;
  adminTasks: AdminTaskView[];
  report: WeeklyReportResponse | null;
  reportWeekStart: string | null;
  editingTaskId: string | null;
  loading: boolean;
} = {
  view: "today",
  today: null,
  adminTasks: [],
  report: null,
  reportWeekStart: null,
  editingTaskId: null,
  loading: true,
};

const pageContent = document.querySelector<HTMLDivElement>("#pageContent")!;
const modalBackdrop = document.querySelector<HTMLDivElement>("#modalBackdrop")!;
const taskForm = document.querySelector<HTMLFormElement>("#taskForm")!;
const taskNameInput = document.querySelector<HTMLInputElement>("#taskName")!;
const taskDescriptionInput = document.querySelector<HTMLTextAreaElement>("#taskDescription")!;
const weeklyFrequencyInput = document.querySelector<HTMLInputElement>("#weeklyFrequency")!;
const taskEnabledInput = document.querySelector<HTMLInputElement>("#taskEnabled")!;
const taskEnabledLabel = document.querySelector<HTMLSpanElement>("#taskEnabledLabel")!;
const formError = document.querySelector<HTMLParagraphElement>("#formError")!;
const modalTitle = document.querySelector<HTMLHeadingElement>("#modalTitle")!;
const modalEyebrow = document.querySelector<HTMLParagraphElement>("#modalEyebrow")!;
const saveTaskButton = document.querySelector<HTMLButtonElement>("#saveTaskButton")!;
const toastRegion = document.querySelector<HTMLDivElement>("#toastRegion")!;
const breadcrumbPage = document.querySelector<HTMLSpanElement>("#breadcrumbPage")!;
const topbarDate = document.querySelector<HTMLSpanElement>("#topbarDate")!;
const navTodayCount = document.querySelector<HTMLSpanElement>("#navTodayCount")!;
const navTaskCount = document.querySelector<HTMLSpanElement>("#navTaskCount")!;

if (!pageContent || !modalBackdrop || !taskForm || !taskNameInput || !taskDescriptionInput || !weeklyFrequencyInput || !taskEnabledInput || !taskEnabledLabel || !formError || !modalTitle || !modalEyebrow || !saveTaskButton || !toastRegion || !breadcrumbPage || !topbarDate || !navTodayCount || !navTaskCount) {
  throw new Error("Cadence could not find its application shell.");
}

bindEvents();
void refreshData();

function bindEvents(): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const viewButton = target.closest<HTMLElement>("[data-view]");
    if (viewButton?.dataset.view === "today" || viewButton?.dataset.view === "reports" || viewButton?.dataset.view === "admin") {
      setView(viewButton.dataset.view);
      return;
    }

    const actionButton = target.closest<HTMLElement>("[data-action]");
    if (!actionButton) return;
    void handleAction(actionButton.dataset.action ?? "", actionButton.dataset.id, actionButton.dataset.date, actionButton.dataset.completed);
  });

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveTask();
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "backfillForm") return;
    event.preventDefault();
    void addHistoricalCompletion(form);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== "reportWeekPicker") return;
    const weekStart = isoWeekToMonday(target.value);
    if (!weekStart) return;
    state.reportWeekStart = weekStart;
    void refreshData(false);
  });

  taskEnabledInput.addEventListener("change", updateEnabledLabel);
  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modalBackdrop.hidden) closeModal();
  });
}

async function refreshData(showLoading = true): Promise<void> {
  if (showLoading) {
    state.loading = true;
    render();
  }

  try {
    const [today, admin] = await Promise.all([
      apiRequest<TodayResponse>("/api/today"),
      apiRequest<{ today: string; tasks: AdminTaskView[] }>("/api/tasks"),
    ]);
    state.today = today;
    state.adminTasks = admin.tasks;
    const reportWeekStart = state.reportWeekStart ?? today.weekStart;
    if (state.view === "reports") {
      state.report = await apiRequest<WeeklyReportResponse>(`/api/reports?weekStart=${encodeURIComponent(reportWeekStart)}`);
      state.reportWeekStart = state.report.weekStart;
    } else if (!state.reportWeekStart) {
      state.reportWeekStart = today.weekStart;
    }
    state.loading = false;
    render();
  } catch (error) {
    state.loading = false;
    renderError(error instanceof Error ? error.message : "The app could not load its data.");
  }
}

function setView(view: string | undefined): void {
  if (view !== "today" && view !== "reports" && view !== "admin") return;
  state.view = view;
  if (view === "reports" && !state.report) {
    state.reportWeekStart = state.today?.weekStart ?? null;
    void refreshData(false);
  }
  render();
}

function render(): void {
  renderChrome();
  if (state.loading) {
    pageContent.innerHTML = `<div class="content-wrap"><div class="loading-state"><span>Loading your rhythm</span></div></div>`;
    return;
  }

  pageContent.innerHTML = state.view === "today"
    ? renderTodayPage()
    : state.view === "reports"
      ? renderReportsPage()
      : renderAdminPage();
}

function renderChrome(): void {
  const today = state.today?.today;
  breadcrumbPage.textContent = state.view === "today" ? "Today" : state.view === "reports" ? "Reports" : "Admin";
  topbarDate.textContent = today ? formatShortDate(today) : "";
  navTodayCount.textContent = String((state.today?.lanes.must.length ?? 0) + (state.today?.lanes.optional.length ?? 0));
  navTaskCount.textContent = String(state.adminTasks.filter((task) => task.enabled).length);

  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function renderTodayPage(): string {
  const data = state.today;
  if (!data) return "";

  const summaryProgress = `${data.summary.completedOccurrences} / ${data.summary.requiredOccurrences}`;
  const progressMeta = data.summary.requiredOccurrences === 0
    ? "Add tasks in Admin to start your week."
    : `${data.summary.progressPercentage}% of this week's targets`; 

  return `
    <div class="content-wrap">
      <section class="welcome-panel">
        <div class="welcome-copy">
          <p class="eyebrow">${escapeHtml(formatLongDate(data.today))}</p>
          <h1>Keep the week <em>in rhythm.</em></h1>
          <p>See what truly needs your attention today, what can wait, and everything else that is still in motion.</p>
          <div class="welcome-actions">
            <button class="button button-primary" type="button" data-action="new-task">Add a periodic task <span aria-hidden="true">→</span></button>
            <span class="welcome-secondary">Week of ${escapeHtml(formatMonthDay(data.weekStart))}</span>
          </div>
        </div>
        <div class="week-orbit" aria-hidden="true">
          <span class="orbit-ring"></span>
          <span class="orbit-ring-inner"></span>
          <span class="orbit-dot orbit-dot-one"></span>
          <span class="orbit-dot orbit-dot-two"></span>
          <span class="orbit-dot orbit-dot-three"></span>
          <div class="orbit-center"><strong>${escapeHtml(summaryProgress)}</strong><span>this week</span></div>
        </div>
      </section>

      <section class="summary-grid" aria-label="Weekly summary">
        ${summaryCard("Week progress", summaryProgress, progressMeta, iconProgress(), "summary-card-highlight")}
        ${summaryCard("Must today", String(data.summary.mustCount), data.summary.mustCount === 0 ? "Nothing urgent right now." : "The last opportunity is today.", iconFlame(), "")}
        ${summaryCard("Active tasks", String(data.summary.activeTasks), `${data.summary.optionalCount} optional · ${data.summary.otherCount} other`, iconStack(), "")}
      </section>

      <section class="today-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Your focus</p>
            <h2>Today</h2>
          </div>
          <span class="section-heading-meta">${escapeHtml(formatLongDate(data.today))} · ${escapeHtml(formatWeekRange(data.weekStart, data.weekEnd))}</span>
        </div>

        <div class="lanes-grid">
          ${renderLane("must", "Must Do Today", "The tasks that cannot wait another day.", data.lanes.must)}
          ${renderLane("optional", "Optional Today", "Flexible tasks with room left this week.", data.lanes.optional)}
          ${renderLane("other", "Other Active Items", "Still active, just not in today's focus.", data.lanes.other)}
        </div>
      </section>

      ${data.previousDays.length > 0 ? renderPreviousDays(data.previousDays) : ""}
    </div>`;
}

function renderPreviousDays(items: PreviousDayItem[]): string {
  return `
    <section class="previous-days-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Catch up</p>
          <h2>From previous days</h2>
        </div>
        <span class="section-heading-meta">${items.length} unfinished ${items.length === 1 ? "item" : "items"}</span>
      </div>
      <div class="previous-days-list">
        ${items.map(renderPreviousDayItem).join("")}
      </div>
    </section>`;
}

function renderPreviousDayItem(item: PreviousDayItem): string {
  return `
    <article class="previous-day-item">
      <span class="previous-day-icon">${iconUndo()}</span>
      <div class="previous-day-copy">
        <strong>${escapeHtml(item.taskName)}</strong>
        <span>${escapeHtml(item.dayLabel)} · ${escapeHtml(item.scheduleLabel)}</span>
        ${item.description ? `<small>${escapeHtml(item.description)}</small>` : ""}
      </div>
      <button class="complete-button" type="button" data-action="complete-previous" data-id="${escapeAttribute(item.taskId)}" data-date="${escapeAttribute(item.dateKey)}">${iconCheck()}<span>Complete</span></button>
    </article>`;
}

function renderReportsPage(): string {
  const report = state.report;
  if (!report) {
    return `<div class="content-wrap"><div class="loading-state"><span>Loading your report</span></div></div>`;
  }

  const reportTitle = report.isCurrentWeek ? "This week" : `Week of ${formatMonthDay(report.weekStart)}`;
  const reportSubtitle = report.isCurrentWeek
    ? `${formatLongDate(report.weekStart)} – ${formatLongDate(report.weekEnd)}`
    : `${formatLongDate(report.weekStart)} – ${formatLongDate(report.weekEnd)}`;
  const backfillDefaultDate = report.isCurrentWeek ? state.today?.today ?? report.weekStart : report.weekStart;
  const selectableTasks = state.adminTasks;

  return `
    <div class="content-wrap">
      <section class="report-heading">
        <div>
          <p class="eyebrow">Patterns over time</p>
          <h1>Weekly reports</h1>
          <p class="admin-heading-copy">Look back at any week, see which scheduled items were missed, and add completions for days that have already passed.</p>
        </div>
        <div class="report-week-controls">
          <button class="week-nav-button" type="button" data-action="report-previous" aria-label="Previous week">←</button>
          <label class="week-picker-label">Review or add a past week<input id="reportWeekPicker" type="week" value="${escapeAttribute(toIsoWeek(report.weekStart))}" max="${escapeAttribute(toIsoWeek(report.currentWeekStart))}" /></label>
          <button class="week-nav-button" type="button" data-action="report-next" aria-label="Next week" ${report.nextWeekStart ? "" : "disabled"}>→</button>
          ${report.isCurrentWeek ? "" : `<button class="button button-quiet report-current-button" type="button" data-action="report-current">Current week</button>`}
        </div>
      </section>

      <section class="report-period-banner">
        <div><span class="report-period-kicker">${escapeHtml(reportTitle)}</span><strong>${escapeHtml(reportSubtitle)}</strong></div>
        <span class="report-period-note">${report.isCurrentWeek ? "Live progress" : "Historical week"}</span>
      </section>

      <section class="report-summary" aria-label="Weekly report summary">
        ${reportStat("Completion", `${report.summary.completedOccurrences}/${report.summary.requiredOccurrences}`, `${report.summary.completionRate}% of target`, iconProgress(), "")}
        ${reportStat("Outstanding", String(report.summary.outstandingOccurrences), report.summary.outstandingOccurrences === 0 ? "Everything is on track" : "Still to be completed", iconClock(), "report-stat-sand")}
        ${reportStat("Missed schedule", String(report.summary.missedScheduledOccurrences), report.summary.missedScheduledOccurrences === 0 ? "No missed fixed days" : "Fixed-day items to catch up", iconUndo(), "report-stat-rose")}
      </section>

      <section class="report-section">
        <div class="report-section-heading"><div><p class="eyebrow">Fixed schedules</p><h2>Day by day</h2></div><span>Complete past items directly here.</span></div>
        <div class="report-days">
          ${report.days.map(renderReportDay).join("")}
        </div>
      </section>

      <section class="report-section report-task-section">
        <div class="report-section-heading"><div><p class="eyebrow">Weekly targets</p><h2>Task progress</h2></div><span>Flexible tasks are counted across the whole week.</span></div>
        <div class="report-task-list">
          ${report.tasks.length > 0 ? report.tasks.map(renderReportTask).join("") : renderReportEmpty()}
        </div>
      </section>

      <section class="backfill-panel">
        <div class="backfill-copy"><span class="backfill-icon">${iconPlus()}</span><div><p class="eyebrow">Backfill a completion</p><h2>Add something from a past day</h2><p>Use this when you completed a flexible task but did not record it at the time.</p></div></div>
        <form class="backfill-form" id="backfillForm">
          <label>Task<select name="taskId" ${selectableTasks.length === 0 ? "disabled" : ""}>${selectableTasks.length > 0 ? selectableTasks.map((task) => `<option value="${escapeAttribute(task.id)}">${escapeHtml(task.name)}</option>`).join("") : "<option>No tasks yet</option>"}</select></label>
          <label>Date<input name="dateKey" type="date" value="${escapeAttribute(backfillDefaultDate)}" max="${escapeAttribute(state.today?.today ?? report.weekEnd)}" required /></label>
          <button class="button button-primary" type="submit" ${selectableTasks.length === 0 ? "disabled" : ""}>Add completion <span aria-hidden="true">→</span></button>
        </form>
      </section>
    </div>`;
}

function reportStat(label: string, value: string, meta: string, icon: string, extraClass: string): string {
  return `<article class="report-stat ${extraClass}"><span class="report-stat-icon">${icon}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></div></article>`;
}

function renderReportDay(day: WeeklyReportResponse["days"][number]): string {
  return `
    <article class="report-day ${day.isToday ? "is-today" : ""} ${day.isFuture ? "is-future" : ""}">
      <div class="report-day-heading"><div><span>${escapeHtml(day.dayLabel)}</span><strong>${escapeHtml(day.dateLabel)}</strong></div>${day.isToday ? `<em>Today</em>` : ""}</div>
      <div class="report-occurrences">
        ${day.occurrences.length > 0 ? day.occurrences.map((occurrence) => renderReportOccurrence(occurrence, day.isFuture)).join("") : `<div class="report-day-empty">No fixed tasks</div>`}
      </div>
    </article>`;
}

function renderReportOccurrence(occurrence: WeeklyReportResponse["days"][number]["occurrences"][number], isFuture: boolean): string {
  const disabled = isFuture || !occurrence.canEdit;
  const actionLabel = occurrence.completed ? "Undo" : "Complete";
  return `
    <div class="report-occurrence ${occurrence.completed ? "is-complete" : ""}">
      <span class="report-occurrence-mark">${occurrence.completed ? iconCheck() : iconCircle()}</span>
      <span class="report-occurrence-name" title="${escapeAttribute(occurrence.taskName)}">${escapeHtml(occurrence.taskName)}</span>
      <button class="report-occurrence-button" type="button" data-action="report-completion" data-id="${escapeAttribute(occurrence.taskId)}" data-date="${escapeAttribute(occurrence.dateKey)}" data-completed="${String(occurrence.completed)}" ${disabled ? "disabled" : ""}>${actionLabel}</button>
    </div>`;
}

function renderReportTask(task: WeeklyReportResponse["tasks"][number]): string {
  const progress = Math.min(task.progressPercentage, 100);
  const datePills = task.completedDates.length > 0
    ? task.completedDates.map((dateKey) => `<span>${escapeHtml(formatMonthDay(dateKey))}</span>`).join("")
    : `<span class="is-muted">No completions recorded</span>`;
  return `
    <article class="report-task-row ${task.enabled ? "" : "is-disabled"}">
      <div class="report-task-main"><div class="report-task-name-row"><strong>${escapeHtml(task.taskName)}</strong>${task.enabled ? "" : `<span class="admin-status is-disabled">Disabled</span>`}</div><p>${escapeHtml(task.description || task.scheduleLabel)}</p></div>
      <div class="report-task-progress"><div><span>${task.completedCount}/${task.requiredCount}</span><small>${task.outstandingCount === 0 ? "Target met" : `${task.outstandingCount} remaining`}</small></div><div class="task-card-progress"><span style="width: ${progress}%"></span></div></div>
      <div class="report-task-dates"><span class="report-dates-label">Recorded</span><div>${datePills}</div></div>
    </article>`;
}

function renderReportEmpty(): string {
  return `<div class="admin-empty"><div class="admin-empty-icon">${iconCalendar()}</div><h3>No tasks to report yet.</h3><p>Add a periodic task in Admin and it will appear in your weekly reports.</p></div>`;
}

function summaryCard(label: string, value: string, meta: string, icon: string, extraClass: string): string {
  return `
    <article class="summary-card ${extraClass}">
      <div class="summary-card-heading"><span class="summary-card-label">${escapeHtml(label)}</span><span class="summary-card-icon ${extraClass ? "" : label === "Active tasks" ? "icon-blue" : "icon-lime"}">${icon}</span></div>
      <div class="summary-card-value">${escapeHtml(value)}</div>
      <div class="summary-card-meta">${escapeHtml(meta)}</div>
    </article>`;
}

function renderLane(kind: "must" | "optional" | "other", title: string, description: string, tasks: TaskView[]): string {
  return `
    <section class="lane lane-${kind}">
      <div class="lane-header">
        <div>
          <div class="lane-title-row"><span class="lane-dot" aria-hidden="true"></span><span class="lane-title">${escapeHtml(title)}</span></div>
          <p class="lane-description">${escapeHtml(description)}</p>
        </div>
        <span class="lane-count">${tasks.length}</span>
      </div>
      <div class="task-stack">
        ${tasks.length > 0 ? tasks.map((task) => renderTaskCard(task, kind)).join("") : renderLaneEmpty(kind)}
      </div>
    </section>`;
}

function renderTaskCard(task: TaskView, kind: "must" | "optional" | "other"): string {
  const progress = Math.min(100, Math.round((task.completedCount / task.weeklyFrequency) * 100));
  const isGoalMet = task.completedCount >= task.weeklyFrequency;
  const canUndo = task.completedToday;
  const buttonDisabled = isGoalMet && !canUndo;
  const buttonLabel = task.completedToday ? "Done today" : isGoalMet ? "Goal met" : "Complete";
  const statusClass = task.completedToday || isGoalMet ? "is-done" : kind === "must" ? "is-due" : "";
  const kicker = kind === "must" ? "Must today" : kind === "optional" ? "Optional" : "Active";
  const descriptionClass = task.description ? "" : "is-empty";

  return `
    <article class="task-card ${task.completedToday ? "is-completed-today" : ""}">
      <div class="task-card-top">
        <span class="task-card-kicker">${kicker}</span>
        <button class="task-card-menu" type="button" data-action="edit-task" data-id="${escapeAttribute(task.id)}" aria-label="Edit ${escapeAttribute(task.name)}">···</button>
      </div>
      <h3 title="${escapeAttribute(task.name)}">${escapeHtml(task.name)}</h3>
      <p class="task-card-description ${descriptionClass}">${escapeHtml(task.description || "No description")}</p>
      <div class="task-card-meta">${iconCalendar()}<span>${escapeHtml(task.scheduleLabel)}</span></div>
      <div class="task-card-progress" aria-label="${task.completedCount} of ${task.weeklyFrequency} completed"><span style="width: ${progress}%"></span></div>
      <div class="task-card-footer">
        <span class="task-card-status ${statusClass}">${escapeHtml(task.statusLabel)} · ${task.completedCount}/${task.weeklyFrequency}</span>
        <button class="complete-button ${task.completedToday ? "is-complete" : ""} ${buttonDisabled ? "is-disabled" : ""}" type="button" data-action="toggle-completion" data-id="${escapeAttribute(task.id)}" ${buttonDisabled ? "disabled" : ""}>
          ${task.completedToday ? iconCheck() : iconPlus()}<span>${buttonLabel}</span>
        </button>
      </div>
    </article>`;
}

function renderLaneEmpty(kind: "must" | "optional" | "other"): string {
  const messages = {
    must: "Nothing has become urgent today.",
    optional: "No flexible tasks are waiting in the wings.",
    other: "Your active list is clear for now.",
  };
  return `<div class="lane-empty"><div class="lane-empty-icon">${kind === "must" ? iconSpark() : kind === "optional" ? iconClock() : iconCheck()}</div><p>${messages[kind]}</p></div>`;
}

function renderAdminPage(): string {
  const tasks = state.adminTasks;
  const activeCount = tasks.filter((task) => task.enabled).length;
  const fixedCount = tasks.filter((task) => task.enabled && task.assignedDays.length > 0).length;
  const flexibleCount = tasks.filter((task) => task.enabled && task.assignedDays.length === 0).length;

  return `
    <div class="content-wrap">
      <section class="admin-heading">
        <div>
          <p class="eyebrow">Workspace settings</p>
          <h1>Periodic tasks</h1>
          <p class="admin-heading-copy">Create the small commitments you want to keep in motion. Fixed days stay predictable; flexible tasks move between Optional and Must as the week unfolds.</p>
        </div>
        <button class="button button-primary" type="button" data-action="new-task"><span class="button-plus" aria-hidden="true">+</span> New task</button>
      </section>

      <section class="admin-overview" aria-label="Task overview">
        ${adminStat("Active tasks", String(activeCount), iconStack(), "")}
        ${adminStat("Fixed schedules", String(fixedCount), iconCalendar(), "icon-sand")}
        ${adminStat("Flexible schedules", String(flexibleCount), iconOrbit(), "icon-slate")}
      </section>

      <section class="admin-list-section">
        <div class="admin-list-heading"><h2>All tasks</h2><span>${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}</span></div>
        ${tasks.length > 0 ? `<div class="admin-task-list">${tasks.map(renderAdminTask).join("")}</div>` : renderAdminEmpty()}
      </section>
    </div>`;
}

function adminStat(label: string, value: string, icon: string, iconClass: string): string {
  return `<article class="admin-stat"><span class="admin-stat-icon ${iconClass}">${icon}</span><div><div class="admin-stat-label">${escapeHtml(label)}</div><div class="admin-stat-value">${escapeHtml(value)}</div></div></article>`;
}

function renderAdminTask(task: AdminTaskView): string {
  return `
    <article class="admin-task-row ${task.enabled ? "" : "is-disabled"}">
      <div class="admin-task-main">
        <div class="admin-task-name-row"><span class="admin-task-name" title="${escapeAttribute(task.name)}">${escapeHtml(task.name)}</span><span class="admin-status ${task.enabled ? "is-enabled" : "is-disabled"}">${task.enabled ? "Enabled" : "Disabled"}</span></div>
        <p class="admin-task-description">${escapeHtml(task.description || "No description added")}</p>
      </div>
      <div class="admin-task-meta"><span>${escapeHtml(task.scheduleLabel)}</span><span class="admin-task-meta-divider">·</span><span>${task.completedCount}/${task.weeklyFrequency} this week</span></div>
      <div class="admin-task-actions">
        <button class="toggle-control ${task.enabled ? "is-on" : ""}" type="button" data-action="toggle-task" data-id="${escapeAttribute(task.id)}" aria-label="${task.enabled ? "Disable" : "Enable"} ${escapeAttribute(task.name)}"><span class="toggle-track" aria-hidden="true"></span><span>${task.enabled ? "On" : "Off"}</span></button>
        <button class="row-action" type="button" data-action="edit-task" data-id="${escapeAttribute(task.id)}" aria-label="Edit ${escapeAttribute(task.name)}">${iconEdit()}</button>
        <button class="row-action delete" type="button" data-action="delete-task" data-id="${escapeAttribute(task.id)}" aria-label="Delete ${escapeAttribute(task.name)}">${iconTrash()}</button>
      </div>
    </article>`;
}

function renderAdminEmpty(): string {
  return `
    <div class="admin-empty">
      <div class="admin-empty-icon">${iconPlus()}</div>
      <h3>Start with one steady thing.</h3>
      <p>Create a task with a weekly target. You can make it fixed to certain days or leave it flexible.</p>
      <button class="button button-primary" type="button" data-action="new-task">Create your first task <span aria-hidden="true">→</span></button>
    </div>`;
}

async function handleAction(action: string, id?: string, dateKey?: string, completedValue?: string): Promise<void> {
  if (action === "new-task") {
    openModal();
    return;
  }
  if (action === "close-modal") {
    closeModal();
    return;
  }
  if (action === "edit-task" && id) {
    const task = state.adminTasks.find((item) => item.id === id);
    if (task) openModal(task);
    return;
  }
  if (action === "toggle-completion" && id) {
    await toggleCompletion(id);
    return;
  }
  if (action === "complete-previous" && id && dateKey) {
    const previousItem = state.today?.previousDays.find((item) => item.taskId === id && item.dateKey === dateKey);
    if (previousItem) await setCompletion(id, dateKey, true, previousItem.taskName);
    return;
  }
  if (action === "report-completion" && id && dateKey) {
    const reportTask = state.report?.tasks.find((task) => task.taskId === id);
    await setCompletion(id, dateKey, completedValue !== "true", reportTask?.taskName ?? "Task");
    return;
  }
  if (action === "report-previous" && state.report) {
    await navigateReport(state.report.previousWeekStart);
    return;
  }
  if (action === "report-next" && state.report?.nextWeekStart) {
    await navigateReport(state.report.nextWeekStart);
    return;
  }
  if (action === "report-current" && state.report) {
    await navigateReport(state.report.currentWeekStart);
    return;
  }
  if (action === "toggle-task" && id) {
    await toggleTask(id);
    return;
  }
  if (action === "delete-task" && id) {
    await deleteTask(id);
    return;
  }
  if (action === "retry") {
    await refreshData();
  }
}

async function toggleCompletion(taskId: string): Promise<void> {
  const task = state.adminTasks.find((item) => item.id === taskId);
  if (!task) return;
  const today = state.today?.today;
  if (!today) return;
  await setCompletion(taskId, today, !task.completedToday, task.name);
}

async function setCompletion(taskId: string, dateKey: string, completed: boolean, taskName: string): Promise<void> {
  try {
    if (completed) {
      await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/completions`, {
        method: "POST",
        body: JSON.stringify({ dateKey }),
        headers: { "content-type": "application/json" },
      });
    } else {
      await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/completions/${encodeURIComponent(dateKey)}`, { method: "DELETE" });
    }
    await refreshData(false);
    showToast(completed ? "Completion added" : "Completion undone", `${taskName} · ${formatMonthDay(dateKey)}`);
  } catch (error) {
    showToast("Could not save that completion", getErrorMessage(error));
  }
}

async function navigateReport(weekStart: string): Promise<void> {
  state.reportWeekStart = weekStart;
  state.report = null;
  render();
  await refreshData(false);
}

async function addHistoricalCompletion(form: HTMLFormElement): Promise<void> {
  const values = new FormData(form);
  const taskId = String(values.get("taskId") ?? "");
  const dateKey = String(values.get("dateKey") ?? "");
  const task = state.adminTasks.find((item) => item.id === taskId);
  if (!task || !dateKey) return;
  await setCompletion(taskId, dateKey, true, task.name);
}

async function toggleTask(taskId: string): Promise<void> {
  const task = state.adminTasks.find((item) => item.id === taskId);
  if (!task) return;

  try {
    await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: task.name,
        description: task.description,
        weeklyFrequency: task.weeklyFrequency,
        assignedDays: task.assignedDays,
        enabled: !task.enabled,
      }),
      headers: { "content-type": "application/json" },
    });
    await refreshData(false);
    showToast(task.enabled ? "Task disabled" : "Task enabled", task.name);
  } catch (error) {
    showToast("Could not update that task", getErrorMessage(error));
  }
}

async function deleteTask(taskId: string): Promise<void> {
  const task = state.adminTasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!window.confirm(`Delete “${task.name}”? Its completion history will also be removed.`)) return;

  try {
    await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
    await refreshData(false);
    showToast("Task deleted", task.name);
  } catch (error) {
    showToast("Could not delete that task", getErrorMessage(error));
  }
}

function openModal(task?: AdminTaskView): void {
  state.editingTaskId = task?.id ?? null;
  modalEyebrow.textContent = task ? "Edit periodic task" : "Periodic task";
  modalTitle.textContent = task ? "Edit task" : "New task";
  saveTaskButton.innerHTML = task ? `Save changes <span aria-hidden="true">→</span>` : `Save task <span aria-hidden="true">→</span>`;
  taskNameInput.value = task?.name ?? "";
  taskDescriptionInput.value = task?.description ?? "";
  weeklyFrequencyInput.value = String(task?.weeklyFrequency ?? 1);
  taskEnabledInput.checked = task?.enabled ?? true;
  Array.from(document.querySelectorAll<HTMLInputElement>('input[name="assignedDays"]')).forEach((input) => {
    input.checked = task?.assignedDays.includes(Number(input.value)) ?? false;
  });
  formError.hidden = true;
  formError.textContent = "";
  updateEnabledLabel();
  modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  window.requestAnimationFrame(() => taskNameInput.focus());
}

function closeModal(): void {
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  state.editingTaskId = null;
  taskForm.reset();
  weeklyFrequencyInput.value = "1";
  updateEnabledLabel();
}

function updateEnabledLabel(): void {
  taskEnabledLabel.textContent = taskEnabledInput.checked ? "Active" : "Paused";
}

async function saveTask(): Promise<void> {
  if (!taskForm.reportValidity()) return;

  const assignedDays = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="assignedDays"]:checked'))
    .map((input) => Number(input.value));
  const weeklyFrequency = Number(weeklyFrequencyInput.value);
  if (assignedDays.length > 0 && weeklyFrequency > assignedDays.length) {
    showFormError("Weekly frequency cannot exceed the number of assigned days. Add more days or lower the target.");
    return;
  }

  const payload = {
    name: taskNameInput.value.trim(),
    description: taskDescriptionInput.value.trim(),
    weeklyFrequency,
    assignedDays,
    enabled: taskEnabledInput.checked,
  };

  try {
    if (state.editingTaskId) {
      await apiRequest(`/api/tasks/${encodeURIComponent(state.editingTaskId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      });
      showToast("Task updated", payload.name);
    } else {
      await apiRequest("/api/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      });
      showToast("Task created", payload.name);
    }
    closeModal();
    await refreshData(false);
  } catch (error) {
    showFormError(getErrorMessage(error));
  }
}

function showFormError(message: string): void {
  formError.textContent = message;
  formError.hidden = false;
}

function showToast(title: string, detail: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span class="toast-icon">✓</span><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
  toastRegion.append(toast);
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 190);
  }, 3000);
}

function renderError(message: string): void {
  renderChrome();
  pageContent.innerHTML = `
    <div class="content-wrap">
      <div class="admin-empty">
        <div class="admin-empty-icon">${iconOrbit()}</div>
        <h3>Cadence is taking a breather.</h3>
        <p>${escapeHtml(message)} Check that the server is running, then try again.</p>
        <button class="button button-primary" type="button" data-action="retry">Try again <span aria-hidden="true">↻</span></button>
      </div>
    </div>`;
}

async function apiRequest<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

function formatLongDate(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(parseDateKey(dateKey));
}

function formatShortDate(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(parseDateKey(dateKey));
}

function formatMonthDay(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(parseDateKey(dateKey));
}

function formatWeekRange(start: string, end: string): string {
  return `${formatMonthDay(start)}–${formatMonthDay(end)}`;
}

function toIsoWeek(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3 - dayIndex);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
  const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - firstDayIndex);
  const weekNumber = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 86_400_000 / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function isoWeekToMonday(value: string): string | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(year, 0, 4, 12));
  const dayIndex = (januaryFourth.getUTCDay() + 6) % 7;
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - dayIndex + (week - 1) * 7);
  return `${januaryFourth.getUTCFullYear()}-${String(januaryFourth.getUTCMonth() + 1).padStart(2, "0")}-${String(januaryFourth.getUTCDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function iconCalendar(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M8 3.75v3M16 3.75v3M4 9.5h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function iconCheck(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.7 12.4 4.05 4.05 8.6-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function iconPlus(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function iconFlame(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13.7 4.2c.1 2.02-.78 3.18-2.04 4.25-.9.76-1.36 1.57-1.36 2.57 0 .91.53 1.67 1.34 2.13-.08-1.14.4-2.03 1.3-2.77.85-.7 1.41-1.52 1.37-2.84 1.96 1.52 3.12 3.4 3.12 5.67 0 3.33-2.25 5.62-5.43 5.62-3.08 0-5.37-2.1-5.37-5.3 0-2.54 1.2-4.54 3.5-6.43-.06 1.45.29 2.4 1.02 3.08.23-1.65.85-3.1 2.55-4.44Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/></svg>`;
}

function iconStack(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="10" width="16" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="16" width="16" height="4" rx="1.5" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

function iconProgress(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M12 4a8 8 0 0 1 7.2 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function iconSpark(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 1.35 5.65L19 10l-5.65 1.35L12 17l-1.35-5.65L5 10l5.65-1.35L12 3ZM19 16l.55 2.45L22 19l-2.45.55L19 22l-.55-2.45L16 19l2.45-.55L19 16Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

function iconClock(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5v5l3.2 1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function iconEdit(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 16.8-.8 3 3-.8L18.4 7.8a2.05 2.05 0 0 0-2.9-2.9L4.3 16.1" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/><path d="m13.9 7.1 3 3" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg>`;
}

function iconTrash(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 7.5h13M9.1 7.5V5.2h5.8v2.3M7.3 7.5l.7 11.2h8l.7-11.2M10 11v4.6M14 11v4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function iconOrbit(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.1" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(28 12 12)" stroke="currentColor" stroke-width="1.25"/><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-28 12 12)" stroke="currentColor" stroke-width="1.25"/></svg>`;
}

function iconUndo(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 8 5 12l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 12H14a4.5 4.5 0 0 1 4.5 4.5v.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function iconCircle(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7.3" stroke="currentColor" stroke-width="1.5"/></svg>`;
}
