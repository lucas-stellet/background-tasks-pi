import type { Task } from "./task-manager.ts";

export type TaskFilter = "all" | "active" | "completed" | "failed" | undefined;
export type TaskStatusFilter = "all" | "active" | "completed" | "failed" | "cancelled";
export type TaskPeriodFilter = "session" | "24h" | "7d" | "all";

export interface TaskBrowserPreferences {
  period: TaskPeriodFilter;
  status: TaskStatusFilter;
  query: string;
}

export interface TaskBrowserFilterContext {
  sessionStartedAt: string;
  now: string;
}

function isActive(task: Task): boolean {
  return task.status === "pending" || task.status === "running" || task.status === "queued" || task.status === "recurring";
}

function fuzzyScore(query: string, text: string): number {
  const lq = query.toLowerCase();
  const lt = text.toLowerCase();
  if (!lq) return 1;
  if (lt.includes(lq)) return 100 + (lq.length / Math.max(1, lt.length)) * 50;

  let score = 0;
  let qi = 0;
  let consecutive = 0;
  for (let i = 0; i < lt.length && qi < lq.length; i++) {
    if (lt[i] === lq[qi]) {
      score += 10 + consecutive;
      consecutive += 5;
      qi++;
    } else {
      consecutive = 0;
    }
  }
  return qi === lq.length ? score : 0;
}

function taskSearchText(task: Task): string {
  return `${task.name} ${task.command} ${task.id} ${task.status}`;
}

export function applyTaskBrowserFilters(tasks: Task[], preferences: TaskBrowserPreferences, context: TaskBrowserFilterContext): Task[] {
  const nowMs = Date.parse(context.now);
  const sessionStartedMs = Date.parse(context.sessionStartedAt);
  const periodStartMs = preferences.period === "session"
    ? sessionStartedMs
    : preferences.period === "24h"
      ? nowMs - 24 * 60 * 60 * 1000
      : preferences.period === "7d"
        ? nowMs - 7 * 24 * 60 * 60 * 1000
        : Number.NEGATIVE_INFINITY;

  let filtered = tasks.filter((task) => Date.parse(task.createdAt) >= periodStartMs);

  if (preferences.status === "active") filtered = filtered.filter(isActive);
  else if (preferences.status !== "all") filtered = filtered.filter((task) => task.status === preferences.status);

  const query = preferences.query.trim();
  if (query) {
    filtered = filtered
      .map((task) => ({ task, score: fuzzyScore(query, taskSearchText(task)) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ task }) => task);
  }

  return filtered;
}

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  if (filter === "active") {
    return tasks.filter(isActive);
  }
  if (filter === "completed") return tasks.filter((t) => t.status === "completed");
  if (filter === "failed") return tasks.filter((t) => t.status === "failed");
  return tasks;
}

function formatDuration(task: Task): string {
  if (task.duration !== undefined) return `${(task.duration / 1000).toFixed(1)}s`;
  if (task.startedAt && task.status === "running") return "running";
  return "-";
}

function tailLines(text: string | undefined, count: number): string {
  if (!text) return "";
  return text.trimEnd().split("\n").slice(-count).join("\n");
}

function formatLiveDuration(task: Task, now: string): string {
  if (task.duration !== undefined) return `${(task.duration / 1000).toFixed(1)}s`;
  if (task.startedAt && (task.status === "running" || task.status === "recurring")) {
    return `${(Math.max(0, Date.parse(now) - Date.parse(task.startedAt)) / 1000).toFixed(1)}s`;
  }
  return "-";
}

export function formatTaskStatusForAgent(task: Task, options: { now?: string; tailLines?: number } = {}): string {
  const now = options.now ?? new Date().toISOString();
  const tailCount = options.tailLines ?? 20;
  const lines = [
    `${task.id} | ${task.name} | ${task.status} | ${formatExit(task)} | ${formatLiveDuration(task, now)}`,
    `command: ${task.command}`,
    `cwd: ${task.cwd ?? process.cwd()}`,
    `stdout: ${task.stdoutPath ?? "-"}`,
    `stderr: ${task.stderrPath ?? "-"}`,
    `result: ${task.resultPath ?? "-"}`,
    `stdoutBytes: ${task.stdoutBytes ?? 0}`,
    `stderrBytes: ${task.stderrBytes ?? 0}`,
    `outputVersion: ${task.outputVersion ?? 0}`,
  ];

  const stdoutTail = tailLines(task.stdout, tailCount);
  const stderrTail = tailLines(task.stderr, tailCount);
  if (stdoutTail) lines.push("", "STDOUT tail:", stdoutTail);
  if (stderrTail) lines.push("", "STDERR tail:", stderrTail);
  return lines.join("\n");
}

function formatExit(task: Task): string {
  return task.exitCode === undefined ? "exit -" : `exit ${task.exitCode}`;
}

export function formatTaskListForAgent(tasks: Task[]): string {
  if (tasks.length === 0) return "No background tasks found.";

  const plural = tasks.length === 1 ? "task" : "tasks";
  const lines = [`${tasks.length} background ${plural}:`];

  for (const task of tasks) {
    const result = task.resultPath ? ` | result ${task.resultPath}` : "";
    lines.push(`- ${task.id} | ${task.name} | ${task.status} | ${formatExit(task)} | ${formatDuration(task)} | ${task.command}${result}`);
  }

  return lines.join("\n");
}

export function markTerminalTaskSeen(task: Task): void {
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    task.resultSeen = true;
  }
}

export function markFinishedTasksSeen(tasks: Task[]): void {
  for (const task of tasks) {
    markTerminalTaskSeen(task);
  }
}
