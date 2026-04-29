import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Task } from "./task-manager.ts";
import {
  createTaskBrowserState,
  handleTaskBrowserSearchInput,
  setTaskBrowserPeriod,
  setTaskBrowserQuery,
  setTaskBrowserStatus,
  type TaskBrowserState,
} from "./task-browser-state.ts";
import type { TaskBrowserPreferences } from "./task-utils.ts";

const OVERLAY_WIDTH = 84;
const LIST_VIEWPORT_HEIGHT = 8;
const DETAIL_VIEWPORT_HEIGHT = 18;
const OUTPUT_TAIL_LINES = 20;

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function row(content: string, width: number, theme: Theme): string {
  const innerW = width - 2;
  const singleLine = content.replace(/[\r\n]+/g, " ").replace(/\t/g, "  ");
  const clipped = truncateToWidth(singleLine, innerW);
  return theme.fg("border", "│") + pad(clipped, innerW) + theme.fg("border", "│");
}

function renderHeader(text: string, width: number, theme: Theme): string {
  const innerW = width - 2;
  const padLen = Math.max(0, innerW - visibleWidth(text));
  const padLeft = Math.floor(padLen / 2);
  const padRight = padLen - padLeft;
  return theme.fg("border", "╭" + "─".repeat(padLeft)) + theme.fg("accent", text) + theme.fg("border", "─".repeat(padRight) + "╮");
}

function renderFooter(text: string, width: number, theme: Theme): string {
  const innerW = width - 2;
  const clipped = truncateToWidth(text, innerW);
  const padLen = Math.max(0, innerW - visibleWidth(clipped));
  const padLeft = Math.floor(padLen / 2);
  const padRight = padLen - padLeft;
  return theme.fg("border", "╰" + "─".repeat(padLeft)) + theme.fg("dim", clipped) + theme.fg("border", "─".repeat(padRight) + "╯");
}

function formatScrollInfo(above: number, below: number): string {
  let info = "";
  if (above > 0) info += `↑ ${above} more`;
  if (below > 0) info += `${info ? "  " : ""}↓ ${below} more`;
  return info;
}

function statusColor(theme: Theme, task: Task): string {
  switch (task.status) {
    case "completed": return theme.fg("success", task.status);
    case "failed": return theme.fg("error", task.status);
    case "running": return theme.fg("warning", task.status);
    case "queued": return theme.fg("accent", task.status);
    case "recurring": return theme.fg("accent", task.status);
    case "cancelled": return theme.fg("muted", task.status);
    default: return theme.fg("dim", task.status);
  }
}

function statusIcon(task: Task): string {
  switch (task.status) {
    case "completed": return "✓";
    case "failed": return "✗";
    case "running": return "●";
    case "pending": return "○";
    case "queued": return "◐";
    case "recurring": return "↻";
    case "cancelled": return "⊘";
  }
}

function taskDuration(task: Task): string {
  if (task.duration !== undefined) return `${(task.duration / 1000).toFixed(1)}s`;
  if (task.startedAt && task.status === "running") return "running";
  return "-";
}

function taskLabel(theme: Theme, task: Task, selected: boolean, innerW: number): string {
  const prefix = selected ? theme.fg("accent", ">") : " ";
  const nameWidth = 24;
  const statusWidth = 12;
  const durationWidth = 8;
  const icon = statusIcon(task);
  const name = selected ? theme.fg("accent", task.name) : task.name;
  const line = `${prefix} ${icon} ${pad(truncateToWidth(name, nameWidth), nameWidth)} ${pad(statusColor(theme, task), statusWidth)} ${pad(theme.fg("dim", taskDuration(task)), durationWidth)} ${theme.fg("dim", task.id.slice(0, 18))}`;
  return truncateToWidth(line, innerW);
}

function wrapText(text: string, width: number): string[] {
  if (!text.trim()) return [];
  const lines: string[] = [];
  for (const rawLine of text.trimEnd().split("\n")) {
    if (!rawLine.trim()) {
      lines.push("");
      continue;
    }
    let line = rawLine;
    while (visibleWidth(line) > width) {
      lines.push(truncateToWidth(line, width));
      line = line.slice(Math.max(1, width));
    }
    lines.push(line);
  }
  return lines;
}

export class TaskBrowserModal implements Component {
  private readonly width = OVERLAY_WIDTH;
  private readonly tasks: Task[];
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly onClose: () => void;
  private readonly onCancel: (taskId: string) => void;
  private readonly onPreferencesChange: (preferences: TaskBrowserPreferences) => void;
  private readonly now: () => string;
  private state: TaskBrowserState;
  private searchMode = false;
  private screen: "list" | "detail" = "list";
  private cursor = 0;
  private scrollOffset = 0;
  private detailScrollOffset = 0;

  constructor(options: {
    tasks: Task[];
    preferences: TaskBrowserPreferences;
    sessionStartedAt: string;
    selectedIndex?: number;
    now?: () => string;
    tui: TUI;
    theme: Theme;
    onClose: () => void;
    onCancel: (taskId: string) => void;
    onPreferencesChange: (preferences: TaskBrowserPreferences) => void;
  }) {
    this.tasks = options.tasks;
    this.now = options.now ?? (() => new Date().toISOString());
    this.state = createTaskBrowserState({
      tasks: this.tasks,
      preferences: options.preferences,
      sessionStartedAt: options.sessionStartedAt,
      now: this.now(),
    });
    this.cursor = Math.max(0, Math.min(options.selectedIndex ?? 0, Math.max(0, this.state.visibleTasks.length - 1)));
    this.tui = options.tui;
    this.theme = options.theme;
    this.onClose = options.onClose;
    this.onCancel = options.onCancel;
    this.onPreferencesChange = options.onPreferencesChange;
    this.ensureScrollVisible();
  }

  private refreshState(): void {
    this.state = createTaskBrowserState({
      tasks: this.tasks,
      preferences: this.state.preferences,
      sessionStartedAt: this.state.sessionStartedAt,
      now: this.now(),
    });
    this.cursor = Math.min(this.cursor, Math.max(0, this.state.visibleTasks.length - 1));
    this.ensureScrollVisible();
  }

  private updateState(next: TaskBrowserState): void {
    this.state = next;
    this.cursor = 0;
    this.scrollOffset = 0;
    this.onPreferencesChange(this.state.preferences);
    this.ensureScrollVisible();
  }

  private selectedTask(): Task | undefined {
    return this.state.visibleTasks[this.cursor];
  }

  private ensureScrollVisible(): void {
    if (this.state.visibleTasks.length <= LIST_VIEWPORT_HEIGHT) {
      this.scrollOffset = 0;
      return;
    }
    if (this.cursor < this.scrollOffset) this.scrollOffset = this.cursor;
    if (this.cursor >= this.scrollOffset + LIST_VIEWPORT_HEIGHT) {
      this.scrollOffset = this.cursor - LIST_VIEWPORT_HEIGHT + 1;
    }
  }

  private cancelSelected(): void {
    const task = this.selectedTask();
    if (!task) return;
    if (!["pending", "running", "queued", "recurring"].includes(task.status)) return;
    this.onCancel(task.id);
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    this.refreshState();

    if (this.searchMode) {
      if (matchesKey(data, "escape")) {
        if (this.state.preferences.query) this.updateState(setTaskBrowserQuery(this.state, ""));
        else this.searchMode = false;
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, "return")) {
        this.searchMode = false;
        this.tui.requestRender();
        return;
      }
      this.updateState(handleTaskBrowserSearchInput(this.state, data));
      this.tui.requestRender();
      return;
    }

    if (this.screen === "detail" && matchesKey(data, "escape")) {
      this.screen = "list";
      this.detailScrollOffset = 0;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
      this.onClose();
      return;
    }

    if (this.screen === "detail") {
      if (matchesKey(data, "up")) this.detailScrollOffset = Math.max(0, this.detailScrollOffset - 1);
      else if (matchesKey(data, "down")) this.detailScrollOffset++;
      else if (matchesKey(data, "pageup")) this.detailScrollOffset = Math.max(0, this.detailScrollOffset - DETAIL_VIEWPORT_HEIGHT);
      else if (matchesKey(data, "pagedown")) this.detailScrollOffset += DETAIL_VIEWPORT_HEIGHT;
      this.tui.requestRender();
      return;
    }

    if (data === "/" || matchesKey(data, "/")) {
      this.searchMode = true;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "s")) {
      this.updateState(setTaskBrowserStatus(this.state));
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "p")) {
      this.updateState(setTaskBrowserPeriod(this.state));
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "return")) {
      if (this.selectedTask()) {
        this.screen = "detail";
        this.detailScrollOffset = 0;
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "up")) {
      this.cursor = Math.max(0, this.cursor - 1);
      this.ensureScrollVisible();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "down")) {
      this.cursor = Math.min(Math.max(0, this.state.visibleTasks.length - 1), this.cursor + 1);
      this.ensureScrollVisible();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "home")) {
      this.cursor = 0;
      this.ensureScrollVisible();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "end")) {
      this.cursor = Math.max(0, this.state.visibleTasks.length - 1);
      this.ensureScrollVisible();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "x") || matchesKey(data, "d")) {
      this.cancelSelected();
    }
  }

  private renderSummary(task: Task, width: number, innerW: number): string[] {
    const lines: string[] = [];
    lines.push(row("", width, this.theme));
    lines.push(row(this.theme.fg("accent", `Selected: ${task.name}`), width, this.theme));
    lines.push(row(`status: ${statusColor(this.theme, task)}  exit: ${task.exitCode ?? "-"}  duration: ${taskDuration(task)}`, width, this.theme));
    lines.push(row(`id: ${this.theme.fg("dim", task.id)}`, width, this.theme));
    lines.push(row(`command: ${truncateToWidth(task.command, innerW - 9)}`, width, this.theme));

    const output = (task.stdout || task.stderr || "").trim();
    if (output) {
      const preview = wrapText(output, innerW - 10).slice(0, 3);
      lines.push(row("", width, this.theme));
      lines.push(row(this.theme.fg("accent", task.stderr && !task.stdout ? "stderr" : "stdout"), width, this.theme));
      for (const line of preview) lines.push(row(`  ${line}`, width, this.theme));
      if (wrapText(output, innerW - 10).length > preview.length) lines.push(row(this.theme.fg("dim", "  … enter for full output"), width, this.theme));
    } else {
      lines.push(row("", width, this.theme));
      lines.push(row(this.theme.fg("dim", "No output captured yet."), width, this.theme));
    }
    return lines;
  }

  private renderList(width: number, innerW: number): string[] {
    this.refreshState();
    const lines: string[] = [renderHeader(" Background Tasks ", width, this.theme)];
    const selected = this.selectedTask();
    const visibleTasks = this.state.visibleTasks;
    const visible = visibleTasks.slice(this.scrollOffset, this.scrollOffset + LIST_VIEWPORT_HEIGHT);
    const searchCursor = this.searchMode ? this.theme.fg("accent", "█") : "";
    const query = this.state.preferences.query ? `${this.state.preferences.query}${searchCursor}` : searchCursor;
    lines.push(row(`${this.theme.fg("dim", "period:")} ${this.state.preferences.period}  ${this.theme.fg("dim", "status:")} ${this.state.preferences.status}  ${this.theme.fg("dim", "search:")} ${query}`, width, this.theme));

    if (visible.length === 0) {
      lines.push(row(this.theme.fg("dim", " No background tasks match the current filters."), width, this.theme));
      for (let i = 1; i < LIST_VIEWPORT_HEIGHT; i++) lines.push(row("", width, this.theme));
    } else {
      lines.push(row(this.theme.fg("dim", "   name                     status       time     id"), width, this.theme));
      for (let i = 0; i < LIST_VIEWPORT_HEIGHT; i++) {
        const task = visible[i];
        if (!task) {
          lines.push(row("", width, this.theme));
          continue;
        }
        const index = this.scrollOffset + i;
        lines.push(row(taskLabel(this.theme, task, index === this.cursor, innerW), width, this.theme));
      }
    }

    const scrollInfo = formatScrollInfo(this.scrollOffset, Math.max(0, visibleTasks.length - (this.scrollOffset + LIST_VIEWPORT_HEIGHT)));
    lines.push(row(scrollInfo ? this.theme.fg("dim", scrollInfo) : "", width, this.theme));

    if (selected) lines.push(...this.renderSummary(selected, width, innerW));
    else lines.push(row(this.theme.fg("dim", "No task selected."), width, this.theme));

    lines.push(renderFooter(" ↑↓ select  / search  p period  s status  enter detail  x cancel  q/esc close ", width, this.theme));
    return lines;
  }

  private renderDetail(task: Task, width: number, innerW: number): string[] {
    const body: string[] = [];
    body.push(row(`${task.name} | ${statusColor(this.theme, task)} | exit ${task.exitCode ?? "-"} | ${taskDuration(task)}`, width, this.theme));
    body.push(row(`id: ${task.id}`, width, this.theme));
    body.push(row(`command: ${truncateToWidth(task.command, innerW - 9)}`, width, this.theme));
    body.push(row("", width, this.theme));

    if (task.stdout) {
      body.push(row(this.theme.fg("accent", "STDOUT"), width, this.theme));
      for (const line of wrapText(task.stdout, innerW - 4).slice(-OUTPUT_TAIL_LINES)) body.push(row(`  ${line}`, width, this.theme));
      body.push(row("", width, this.theme));
    }
    if (task.stderr) {
      body.push(row(this.theme.fg("error", "STDERR"), width, this.theme));
      for (const line of wrapText(task.stderr, innerW - 4).slice(-OUTPUT_TAIL_LINES)) body.push(row(`  ${this.theme.fg("error", line)}`, width, this.theme));
    }
    if (!task.stdout && !task.stderr) body.push(row(this.theme.fg("dim", "No output captured yet."), width, this.theme));

    const maxOffset = Math.max(0, body.length - DETAIL_VIEWPORT_HEIGHT);
    this.detailScrollOffset = Math.min(this.detailScrollOffset, maxOffset);
    const visible = body.slice(this.detailScrollOffset, this.detailScrollOffset + DETAIL_VIEWPORT_HEIGHT);
    const scrollInfo = formatScrollInfo(this.detailScrollOffset, Math.max(0, body.length - (this.detailScrollOffset + visible.length)));

    return [
      renderHeader(` Task ${task.id.slice(0, 8)} `, width, this.theme),
      ...visible,
      ...Array(Math.max(0, DETAIL_VIEWPORT_HEIGHT - visible.length)).fill(row("", width, this.theme)),
      row(scrollInfo ? this.theme.fg("dim", scrollInfo) : "", width, this.theme),
      renderFooter(" ↑↓ scroll  esc summary  q close ", width, this.theme),
    ];
  }

  render(width: number): string[] {
    const w = Math.min(width, this.width);
    const innerW = w - 2;
    const selected = this.selectedTask();
    if (this.screen === "detail" && selected) return this.renderDetail(selected, w, innerW);
    return this.renderList(w, innerW);
  }

  invalidate(): void {
    // Rendering is intentionally recomputed from task state each time.
  }
}
