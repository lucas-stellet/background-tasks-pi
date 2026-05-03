import type { Task } from "./task-manager.ts";

export function buildFooterText(tasks: Task[]): string | undefined {
  const visible = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => ["running", "pending", "queued"].includes(task.status))
    .sort((a, b) => {
      const byCreatedAt = new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime();
      return byCreatedAt === 0 ? a.index - b.index : byCreatedAt;
    })
    .map(({ task }) => task);

  if (visible.length === 0) return undefined;

  const running = visible.filter((t) => t.status === "running" || t.status === "pending" || t.status === "queued");
  const sections: string[] = [];

  // Ephemeral section
  const ephemeralParts: string[] = [];
  for (const t of running.slice(0, 2)) {
    ephemeralParts.push(`"${t.name}" running`);
  }
  const moreRunning = running.length - 2;
  if (moreRunning > 0) ephemeralParts.push(`${moreRunning} running`);

  if (ephemeralParts.length > 0) {
    sections.push(`📋 ${ephemeralParts.join(", ")}`);
  }

  return sections.length > 0 ? sections.join("  ") : undefined;
}
