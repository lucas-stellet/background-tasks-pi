import type { Task } from "./task-manager.ts";
import { applyTaskBrowserFilters, type TaskBrowserPreferences, type TaskPeriodFilter, type TaskStatusFilter } from "./task-utils.ts";

export interface TaskBrowserState {
  tasks: Task[];
  preferences: TaskBrowserPreferences;
  sessionStartedAt: string;
  now: string;
  visibleTasks: Task[];
}

const PERIODS: TaskPeriodFilter[] = ["session", "24h", "7d", "all"];
const STATUSES: TaskStatusFilter[] = ["all", "active", "completed", "failed", "cancelled"];

function refresh(state: Omit<TaskBrowserState, "visibleTasks">): TaskBrowserState {
  return {
    ...state,
    visibleTasks: applyTaskBrowserFilters(state.tasks, state.preferences, {
      sessionStartedAt: state.sessionStartedAt,
      now: state.now,
    }),
  };
}

export function createTaskBrowserState(options: {
  tasks: Task[];
  preferences: TaskBrowserPreferences;
  sessionStartedAt: string;
  now: string;
}): TaskBrowserState {
  return refresh({ ...options });
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

export function handleTaskBrowserSearchInput(state: TaskBrowserState, data: string): TaskBrowserState {
  if (data === "\u007f" || data === "\b") {
    return setTaskBrowserQuery(state, state.preferences.query.slice(0, -1));
  }

  if (data.length === 1 && data >= " " && data !== "\u007f") {
    return setTaskBrowserQuery(state, state.preferences.query + data);
  }

  return state;
}
