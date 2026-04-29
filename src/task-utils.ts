import type { Task } from "./task-manager.ts";

export type TaskFilter = "all" | "active" | "completed" | "failed" | undefined;

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  if (filter === "active") {
    return tasks.filter((t) => t.status === "pending" || t.status === "running" || t.status === "queued" || t.status === "recurring");
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
