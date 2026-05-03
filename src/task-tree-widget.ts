import type { Task } from "./task-manager.ts";

interface Component {
  invalidate(): void;
  render(width: number): string[];
}

interface Theme {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  const clean = stripAnsi(text);
  if (clean.length <= width) return text;
  return clean.slice(0, Math.max(0, width - 1)) + "…";
}

function fg(theme: Theme, color: string, text: string): string {
  return theme.fg ? theme.fg(color, text) : text;
}

function bold(theme: Theme, text: string): string {
  return theme.bold ? theme.bold(text) : text;
}

function terminalTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => TERMINAL_STATUSES.has(task.status) && !task.resultSeen)
    .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime());
}

function statusGlyph(task: Task): string {
  return task.status === "completed" ? "✓" : "✗";
}

function statusText(task: Task): string {
  if (task.status === "completed") return `exit ${task.exitCode ?? 0}`;
  return task.error ?? (typeof task.exitCode === "number" ? `exit code ${task.exitCode}` : "failed");
}

function durationText(task: Task): string | undefined {
  return typeof task.duration === "number" ? `${(task.duration / 1000).toFixed(1)}s` : undefined;
}

export function buildTaskTreeWidgetLines(tasks: Task[], theme: Theme = {}, width = 120): string[] {
  const visible = terminalTasks(tasks);
  if (visible.length === 0) return [];

  const title = visible.length === 1 ? "background task result" : `background task results (${visible.length})`;
  const lines = [`${fg(theme, "toolTitle", bold(theme, title))} ${fg(theme, "dim", "· background")}`];

  for (const [index, task] of visible.slice(0, 5).entries()) {
    const last = index === Math.min(visible.length, 5) - 1 && visible.length <= 5;
    const branch = last ? "└─" : "├─";
    const continuation = last ? "   " : "│  ";
    const color = task.status === "completed" ? "success" : "error";
    const parts = [statusText(task), durationText(task)].filter(Boolean).join(" · ");

    lines.push(`${fg(theme, "dim", branch)} ${fg(theme, color, statusGlyph(task))} ${bold(theme, task.name)} ${fg(theme, "dim", `· ${parts}`)}`);
    lines.push(`${fg(theme, "dim", continuation)} ${fg(theme, "dim", `⎿  ${task.id}${task.resultPath ? ` · ${task.resultPath}` : ""}`)}`);
  }

  if (visible.length > 5) lines.push(fg(theme, "dim", `└─ +${visible.length - 5} more finished tasks`));

  return lines.map((line) => truncate(line, width));
}

export function createTaskTreeWidget(tasks: Task[]): (_tui: unknown, theme: Theme) => Component {
  return (_tui, theme) => ({
    invalidate(): void {},
    render(width: number): string[] {
      return buildTaskTreeWidgetLines(tasks, theme, width).map((line) => ` ${line}`);
    },
  });
}
