import type { Task } from "./task-manager.ts";
import { applyTaskBrowserFilters, type TaskBrowserPreferences, type TaskPeriodFilter, type TaskStatusFilter } from "./task-utils.ts";

export type TaskSortColumn = "name" | "status" | "time" | "id";
export type TaskSortDirection = "asc" | "desc";

export interface TaskBrowserSort {
  column: TaskSortColumn;
  direction: TaskSortDirection;
}

export interface TaskBrowserState {
  tasks: Task[];
  preferences: TaskBrowserPreferences;
  sessionStartedAt: string;
  now: string;
  sort: TaskBrowserSort;
  visibleTasks: Task[];
}

const PERIODS: TaskPeriodFilter[] = ["session", "24h", "7d", "all"];
const STATUSES: TaskStatusFilter[] = ["all", "active", "completed", "failed", "cancelled"];
const SORT_COLUMNS: TaskSortColumn[] = ["name", "status", "time", "id"];
const DEFAULT_SORT: TaskBrowserSort = { column: "name", direction: "asc" };

function sortValue(task: Task, column: TaskSortColumn): string | number {
  switch (column) {
    case "name": return task.name.toLowerCase();
    case "status": return task.status;
    case "time": return task.duration ?? 0;
    case "id": return task.id;
  }
}

function compareTasks(a: Task, b: Task, sort: TaskBrowserSort): number {
  const aValue = sortValue(a, sort.column);
  const bValue = sortValue(b, sort.column);
  const direction = sort.direction === "asc" ? 1 : -1;
  if (aValue < bValue) return -1 * direction;
  if (aValue > bValue) return 1 * direction;
  return a.id.localeCompare(b.id);
}

function refresh(state: Omit<TaskBrowserState, "visibleTasks">): TaskBrowserState {
  const visibleTasks = applyTaskBrowserFilters(state.tasks, state.preferences, {
    sessionStartedAt: state.sessionStartedAt,
    now: state.now,
  }).toSorted((a, b) => compareTasks(a, b, state.sort));

  return {
    ...state,
    visibleTasks,
  };
}

export function createTaskBrowserState(options: {
  tasks: Task[];
  preferences: TaskBrowserPreferences;
  sessionStartedAt: string;
  now: string;
  sort?: TaskBrowserSort;
}): TaskBrowserState {
  return refresh({ ...options, sort: options.sort ?? DEFAULT_SORT });
}

export function setTaskBrowserPeriod(state: TaskBrowserState): TaskBrowserState {
  const index = PERIODS.indexOf(state.preferences.period);
  const period = PERIODS[(index + 1) % PERIODS.length]!;
  return refresh({ ...state, preferences: { ...state.preferences, period } });
}

export function setTaskBrowserStatus(state: TaskBrowserState): TaskBrowserState {
  const index = STATUSES.indexOf(state.preferences.status);
  const status = STATUSES[(index + 1) % STATUSES.length]!;
  return refresh({ ...state, preferences: { ...state.preferences, status } });
}

export function setTaskBrowserQuery(state: TaskBrowserState, query: string): TaskBrowserState {
  return refresh({ ...state, preferences: { ...state.preferences, query } });
}

export function moveTaskBrowserSortColumn(state: TaskBrowserState, delta: -1 | 1): TaskBrowserState {
  const index = SORT_COLUMNS.indexOf(state.sort.column);
  const nextIndex = (index + delta + SORT_COLUMNS.length) % SORT_COLUMNS.length;
  return refresh({ ...state, sort: { ...state.sort, column: SORT_COLUMNS[nextIndex]! } });
}

export function setTaskBrowserSortDirection(state: TaskBrowserState): TaskBrowserState {
  const direction: TaskSortDirection = state.sort.direction === "asc" ? "desc" : "asc";
  return refresh({ ...state, sort: { ...state.sort, direction } });
}

export function handleTaskBrowserSearchInput(state: TaskBrowserState, data: string): TaskBrowserState {
  if (data === "\u007f" || data === "\b") {
    return setTaskBrowserQuery(state, state.preferences.query.slice(0, -1));
  }

  if (data.length === 1 && data >= " " && data !== "\u007f") {
    return setTaskBrowserQuery(state, state.preferences.query + data);
  }

  return state;
}
