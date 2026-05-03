import type { Task } from "./task-manager.ts";

interface Component {
  invalidate(): void;
  render(width: number): string[];
}

interface Theme {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
}

const TREE_STATUSES = new Set(["completed", "failed", "recurring", "running"]);
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const RECURRING_SPINNER = ["⟳", "↻", "↺"];
const SPINNER_MS = 160;
const RECURRING_SPINNER_MS = 1000;

const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint === 0xfe0f) return 0;
  if (codePoint === 0x26a0 || codePoint === 0x26a1 || codePoint >= 0x1f000) return 2;
  if (codePoint >= 0x1100 && (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  )) return 2;
  return 1;
}

function visibleWidth(text: string): number {
  let width = 0;
  for (const char of stripAnsi(text)) width += charWidth(char);
  return width;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  let output = "";
  let used = 0;
  for (const char of stripAnsi(text)) {
    const nextWidth = charWidth(char);
    if (used + nextWidth > Math.max(0, width - 1)) break;
    output += char;
    used += nextWidth;
  }
  return output + "…";
}

function fg(theme: Theme, color: string, text: string): string {
  return theme.fg ? theme.fg(color, text) : text;
}

function bold(theme: Theme, text: string): string {
  return theme.bold ? theme.bold(text) : text;
}

function treeTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.status === "recurring" || task.status === "running" || (TREE_STATUSES.has(task.status) && !task.resultSeen))
    .sort((a, b) => new Date(b.completedAt ?? b.updatedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.updatedAt ?? a.createdAt).getTime());
}

function statusGlyph(task: Task, now = Date.now()): string {
  if (task.status === "completed") return "✓";
  if (task.status === "recurring") return RECURRING_SPINNER[Math.floor(now / RECURRING_SPINNER_MS) % RECURRING_SPINNER.length]!;
  if (task.status === "running") return SPINNER[Math.floor(now / SPINNER_MS) % SPINNER.length]!;
  return "✗";
}

function statusText(task: Task): string {
  if (task.status === "completed") return `exit ${task.exitCode ?? 0}`;
  if (task.status === "recurring") return `recurring every ${task.interval}s`;
  if (task.status === "running") return "running";
  return task.error ?? (typeof task.exitCode === "number" ? `exit code ${task.exitCode}` : "failed");
}

function durationText(task: Task): string | undefined {
  if (task.status === "recurring" || task.status === "running") return undefined;
  return typeof task.duration === "number" ? `${(task.duration / 1000).toFixed(1)}s` : undefined;
}

function activityAge(ms: number): string {
  if (ms < 1000) return "now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m`;
}

function activityText(task: Task, now: number): string | undefined {
  const timestamp = task.lastOutputAt ?? task.updatedAt ?? task.startedAt;
  if (!timestamp) return undefined;
  const age = activityAge(Math.max(0, now - new Date(timestamp).getTime()));
  return age === "now" ? "active now" : `active ${age} ago`;
}

export function buildTaskTreeWidgetLines(tasks: Task[], theme: Theme = {}, width = 120, now = Date.now()): string[] {
  const visible = treeTasks(tasks);
  if (visible.length === 0) return [];

  const title = visible.length === 1 ? "background task result" : `background task results (${visible.length})`;
  const lines = [`${fg(theme, "toolTitle", bold(theme, title))} ${fg(theme, "dim", "· background")}`];

  for (const [index, task] of visible.slice(0, 5).entries()) {
    const last = index === Math.min(visible.length, 5) - 1 && visible.length <= 5;
    const branch = last ? "└─" : "├─";
    const continuation = last ? "   " : "│  ";
    const color = task.status === "completed" ? "success" : task.status === "recurring" || task.status === "running" ? "accent" : "error";
    const parts = [statusText(task), durationText(task), activityText(task, now)].filter(Boolean).join(" · ");

    lines.push(`${fg(theme, "dim", branch)} ${fg(theme, color, statusGlyph(task, now))} ${bold(theme, task.name)} ${fg(theme, "dim", `· ${parts}`)}`);
  }

  if (visible.length > 5) lines.push(fg(theme, "dim", `└─ +${visible.length - 5} more finished tasks`));

  return lines.map((line) => truncate(line, width));
}

export function createTaskTreeWidget(tasks: Task[]): (_tui: unknown, theme: Theme) => Component {
  return (_tui, theme) => ({
    invalidate(): void {},
    render(width: number): string[] {
      const innerWidth = Math.max(0, width - 1);
      return buildTaskTreeWidgetLines(tasks, theme, innerWidth).map((line) => ` ${line}`);
    },
  });
}
