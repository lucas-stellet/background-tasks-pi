import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskBrowserPreferences, TaskPeriodFilter, TaskStatusFilter } from "./task-utils.ts";

export interface TaskBrowserConfig {
  taskBrowser: TaskBrowserPreferences;
}

export const DEFAULT_TASK_BROWSER_PREFERENCES: TaskBrowserPreferences = {
  period: "session",
  status: "all",
  query: "",
};

const PERIODS = new Set<TaskPeriodFilter>(["session", "24h", "7d", "all"]);
const STATUSES = new Set<TaskStatusFilter>(["all", "active", "completed", "failed", "cancelled"]);

function configPath(cwd: string): string {
  return join(cwd, ".background-tasks", "config.json");
}

function sanitizePreferences(value: unknown): TaskBrowserPreferences {
  const input = typeof value === "object" && value !== null ? value as Partial<TaskBrowserPreferences> : {};
  return {
    period: PERIODS.has(input.period as TaskPeriodFilter) ? input.period as TaskPeriodFilter : DEFAULT_TASK_BROWSER_PREFERENCES.period,
    status: STATUSES.has(input.status as TaskStatusFilter) ? input.status as TaskStatusFilter : DEFAULT_TASK_BROWSER_PREFERENCES.status,
    query: typeof input.query === "string" ? input.query : DEFAULT_TASK_BROWSER_PREFERENCES.query,
  };
}

export function loadTaskBrowserConfig(cwd: string): TaskBrowserConfig {
  const path = configPath(cwd);
  if (!existsSync(path)) return { taskBrowser: { ...DEFAULT_TASK_BROWSER_PREFERENCES } };

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return { taskBrowser: sanitizePreferences(parsed?.taskBrowser) };
  } catch {
    return { taskBrowser: { ...DEFAULT_TASK_BROWSER_PREFERENCES } };
  }
}

export function saveTaskBrowserConfig(cwd: string, preferences: TaskBrowserPreferences): void {
  const dir = join(cwd, ".background-tasks");
  mkdirSync(dir, { recursive: true });
  const config = { taskBrowser: sanitizePreferences(preferences) };
  writeFileSync(configPath(cwd), JSON.stringify(config, null, 2) + "\n");
}
