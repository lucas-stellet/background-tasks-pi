import type { Task } from "./task-manager.ts";

export function buildFooterText(tasks: Task[]): string | undefined {
  const visible = tasks
    .filter((t) => !t.resultSeen && ["running", "pending", "completed", "failed", "queued"].includes(t.status))
    .filter((t) => t.type !== "recurring") // recurring tasks use notifications, not footer
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (visible.length === 0) return undefined;

  const running = visible.filter((t) => t.status === "running" || t.status === "pending" || t.status === "queued");
  const finished = visible.filter((t) => t.status === "completed" || t.status === "failed");

  const parts: string[] = [];

  for (const t of running.slice(0, 2)) {
    parts.push(`"${t.name}" running`);
  }
  const moreRunning = running.length - 2;
  if (moreRunning > 0) parts.push(`${moreRunning} running`);

  if (finished.length > 0) parts.push(`${finished.length} completed`);

  return parts.length > 0 ? `📋 ${parts.join(", ")}` : undefined;
}
