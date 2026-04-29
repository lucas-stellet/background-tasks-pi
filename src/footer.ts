import type { Task } from "./task-manager.ts";

export function buildFooterText(tasks: Task[]): string | undefined {
  const visible = tasks
    .filter((t) => !t.resultSeen && ["running", "pending", "completed", "failed", "queued", "recurring"].includes(t.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (visible.length === 0) return undefined;

  // Recurring tasks count as "running", never as "completed"
  const running = visible.filter((t) =>
    t.status === "running" || t.status === "pending" || t.status === "queued" || t.status === "recurring"
  );
  const finished = visible.filter((t) =>
    t.status === "completed" || t.status === "failed"
  );

  const parts: string[] = [];

  for (const t of running.slice(0, 2)) {
    const prefix = t.type === "recurring" ? "🔄 " : "";
    parts.push(`${prefix}"${t.name}" running`);
  }
  const moreRunning = running.length - 2;
  if (moreRunning > 0) parts.push(`${moreRunning} running`);

  if (finished.length > 0) parts.push(`${finished.length} completed`);

  return parts.length > 0 ? `📋 ${parts.join(", ")}` : undefined;
}
