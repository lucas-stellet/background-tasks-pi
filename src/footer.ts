import type { Task } from "./task-manager.ts";

export function buildFooterText(tasks: Task[]): string | undefined {
  const visible = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => !task.resultSeen && ["running", "pending", "completed", "failed", "queued", "recurring"].includes(task.status))
    .sort((a, b) => {
      const byCreatedAt = new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime();
      return byCreatedAt === 0 ? a.index - b.index : byCreatedAt;
    })
    .map(({ task }) => task);

  if (visible.length === 0) return undefined;

  const recurring = visible.filter((t) => t.status === "recurring");
  const running = visible.filter((t) => t.status === "running" || t.status === "pending" || t.status === "queued");
  const finished = visible.filter((t) => t.status === "completed" || t.status === "failed");

  const sections: string[] = [];

  // Recurring section
  if (recurring.length > 0) {
    const names = recurring.slice(0, 2).map((t) => `"${t.name}" recurring`).join(", ");
    const more = recurring.length > 2 ? `, +${recurring.length - 2} more` : "";
    sections.push(`🔄 ${names}${more}`);
  }

  // Ephemeral section
  const ephemeralParts: string[] = [];
  for (const t of running.slice(0, 2)) {
    ephemeralParts.push(`"${t.name}" running`);
  }
  const moreRunning = running.length - 2;
  if (moreRunning > 0) ephemeralParts.push(`${moreRunning} running`);

  if (finished.length > 0) ephemeralParts.push(`${finished.length} completed`);

  if (ephemeralParts.length > 0) {
    sections.push(`📋 ${ephemeralParts.join(", ")}`);
  }

  return sections.length > 0 ? sections.join("  ") : undefined;
}
