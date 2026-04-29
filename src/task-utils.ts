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

export function markFinishedTasksSeen(tasks: Task[]): void {
  for (const task of tasks) {
    if (task.status === "completed" || task.status === "failed") {
      task.resultSeen = true;
    }
  }
}
