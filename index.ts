/**
 * Background Tasks Extension for pi
 *
 * Tools:
 *   run-background-task  — run a command once, returns immediately
 *   run-recurring-task   — run a command every N seconds until cancelled
 *   list-background-tasks — list all tasks with status filter
 *   get-background-task-result — get stdout/stderr of completed task
 *   cancel-background-task — cancel running/pending/recurring task
 *
 * Commands:
 *   /run-task <name> <cmd>
 *   /list-tasks
 *   /tasks
 *
 * Footer: shows up to 2 running tasks by name, + counts for rest
 * Notifications: queued when agent busy, delivered immediately when idle
 */

import { StringEnum, Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createTaskManager, type Task } from "./src/task-manager.ts";
import { createTaskRunner } from "./src/task-runner.ts";

// ── State ────────────────────────────────────────────────────────────
let pi: ExtensionAPI | null = null;
let isAgentIdle = true;
let currentCtx: { ui: { setStatus: (id: string, text: string | undefined) => void } } | null = null;
let pendingNotifications: Array<{ summary: string; status: string }> = [];

const manager = createTaskManager({ maxConcurrent: 5 });
const runner = createTaskRunner({
  onTaskStart(task) {
    updateFooter();
  },
  onTaskComplete(task) {
    updateFooter();
    notifyAgent(getSummary(task), "completed");
  },
  onTaskError(task, error) {
    updateFooter();
    notifyAgent(`${task.name}: ${error}`, "failed");
  },
  onRecurringCycle(task) {
    updateFooter();
    const output = task.stdout?.trim() || "(no output)";
    notifyAgent(`${task.name}: ${output}`, "recurring");
  },
});

// ── Helpers ───────────────────────────────────────────────────────────
function getSummary(task: Task): string {
  const emoji = task.status === "completed" ? "✓" : task.status === "failed" ? "✗" : task.status === "recurring" ? "🔄" : "⏳";
  switch (task.status) {
    case "completed":
      return `${emoji} ${task.name}: exit ${task.exitCode} in ${((task.duration ?? 0) / 1000).toFixed(1)}s`;
    case "failed":
      return `${emoji} ${task.name}: ${task.error ?? "failed"}`;
    case "recurring":
      return `${emoji} ${task.name}: recurring every ${task.interval}s`;
    default:
      return `${emoji} ${task.name}: ${task.status}`;
  }
}

function getVisibleTasks(): Task[] {
  return manager.getTasks()
    .filter((t) => !t.resultSeen && (t.status === "running" || t.status === "pending" || t.status === "completed" || t.status === "failed" || t.status === "recurring" || t.status === "queued"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function buildFooterText(): string | undefined {
  const visible = getVisibleTasks();
  if (visible.length === 0) return undefined;

  const running = visible.filter((t) => t.status === "running" || t.status === "pending" || t.status === "queued");
  const finished = visible.filter((t) => t.status === "completed" || t.status === "failed");
  const recurring = visible.filter((t) => t.status === "recurring");

  const parts: string[] = [];

  for (const t of running.slice(0, 2)) {
    parts.push(`"${t.name}" running`);
  }
  const moreRunning = running.length - 2;
  if (moreRunning > 0) parts.push(`${moreRunning} running`);

  if (finished.length > 0) parts.push(`${finished.length} completed`);
  if (recurring.length > 0) parts.push(`${recurring.length} recurring`);

  return `📋 ${parts.join(", ")}`;
}

function updateFooter(): void {
  if (!currentCtx) return;
  currentCtx.ui.setStatus("background-tasks", buildFooterText());
}

function notifyAgent(summary: string, status: string): void {
  pendingNotifications.push({ summary, status });
  if (isAgentIdle && pi) {
    const n = pendingNotifications.shift();
    if (!n) return;
    pi.sendMessage({
      customType: "background-task",
      content: `🔔 ${n.summary}`,
      display: true,
      details: {},
    }, { deliverAs: "steer", triggerTurn: true });
  }
}

function flushNotifications(): void {
  if (!pi) return;
  for (const n of pendingNotifications) {
    pi.sendMessage({
      customType: "background-task",
      content: `🔔 ${n.summary}`,
      display: true,
      details: {},
    }, { deliverAs: "steer", triggerTurn: true });
  }
  pendingNotifications = [];
}

// ── Tools ─────────────────────────────────────────────────────────────
const runBackgroundTaskTool = defineTool({
  name: "run-background-task",
  label: "Run Background Task",
  description: "Run a shell command in the background. Returns immediately with a task ID.",
  promptSnippet: "Run long-running shell commands in background without blocking",
  promptGuidelines: [
    "Use run-background-task when the user asks to run a command that may take more than a few seconds: builds, tests, data processing, file searches, etc.",
    "Use run-background-task for any command the user explicitly asks to run in background or async.",
    "Always give the task a short, descriptive name so the user can identify it in the footer and notifications.",
    "After starting a task, tell the user it's running — they'll get a notification when it completes.",
  ],
  parameters: Type.Object({
    name: Type.String({ description: "Descriptive name for the task" }),
    command: Type.String({ description: "Shell command to execute" }),
    timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 300)" })),
  }),

  async execute(_id, params) {
    const task = manager.createBackground({
      name: params.name,
      command: params.command,
      timeout: params.timeout ?? 300,
    });

    runner.run(task);
    updateFooter();

    return {
      content: [{ type: "text", text: `Started: "${task.name}" (${task.id})` }],
      details: { taskId: task.id, status: task.status },
    };
  },
});

const runRecurringTaskTool = defineTool({
  name: "run-recurring-task",
  label: "Run Recurring Task",
  description: "Run a shell command every N seconds until cancelled. Use cancel-background-task to stop.",
  promptSnippet: "Run a command repeatedly at fixed intervals until cancelled",
  promptGuidelines: [
    "Use run-recurring-task when the user wants a command to run repeatedly on a schedule — e.g. polling a status, watching a file, periodic health checks.",
    "The task runs forever until cancelled with cancel-background-task.",
    "Give it a descriptive name so the user can identify it in the footer.",
  ],
  parameters: Type.Object({
    name: Type.String({ description: "Descriptive name for the task" }),
    command: Type.String({ description: "Shell command to execute" }),
    interval: Type.Number({ description: "Interval in seconds between runs" }),
    timeout: Type.Optional(Type.Number({ description: "Timeout per run in seconds (default: 300)" })),
  }),

  async execute(_id, params) {
    const task = manager.createRecurring({
      name: params.name,
      command: params.command,
      interval: params.interval,
    });
    task.timeout = params.timeout;

    // Run immediately, then on interval
    const runLoop = async () => {
      if (task.status !== "recurring") return;
      await runner.run(task);
      updateFooter();
      setTimeout(runLoop, params.interval * 1000);
    };
    runLoop();
    updateFooter();

    return {
      content: [{ type: "text", text: `Started recurring: "${task.name}" every ${params.interval}s (${task.id})` }],
      details: { taskId: task.id, status: "recurring" },
    };
  },
});

const listBackgroundTasksTool = defineTool({
  name: "list-background-tasks",
  label: "List Background Tasks",
  description: "List all background tasks with their status. Marks listed tasks as seen (removes from footer).",
  promptSnippet: "List background tasks with status filter (all/active/completed/failed)",
  promptGuidelines: [
    "Use list-background-tasks when the user asks 'what tasks are running?' or wants to see background task status.",
    "This also clears completed tasks from the footer — use it after tasks finish to clean up the display.",
  ],
  parameters: Type.Object({
    filter: Type.Optional(StringEnum(["all", "active", "completed", "failed"] as const)),
  }),

  async execute(_id, params) {
    let taskList = manager.getTasks();

    if (params.filter === "active") {
      taskList = taskList.filter((t) => t.status === "pending" || t.status === "running" || t.status === "queued" || t.status === "recurring");
    } else if (params.filter === "completed") {
      taskList = taskList.filter((t) => t.status === "completed");
    } else if (params.filter === "failed") {
      taskList = taskList.filter((t) => t.status === "failed");
    }

    // Mark all finished as seen
    for (const t of taskList) {
      if (t.status === "completed" || t.status === "failed") t.resultSeen = true;
    }
    updateFooter();

    if (taskList.length === 0) {
      return { content: [{ type: "text", text: "No background tasks found." }], details: { count: 0 } };
    }

    const summary = taskList.map(getSummary).join("\n");
    return { content: [{ type: "text", text: `Tasks (${taskList.length}):\n${summary}` }], details: { count: taskList.length } };
  },
});

const getBackgroundTaskResultTool = defineTool({
  name: "get-background-task-result",
  label: "Get Task Result",
  description: "Get the result of a completed or failed background task. Marks task as seen.",
  promptSnippet: "Retrieve stdout/stderr from completed or failed background tasks",
  promptGuidelines: [
    "Use get-background-task-result when the user wants to see the output of a specific completed task.",
    "The user may reference the task by name or ID — match it against the task list.",
  ],
  parameters: Type.Object({ taskId: Type.String({ description: "The task ID" }) }),

  async execute(_id, params) {
    const task = manager.getTask(params.taskId);
    if (!task) return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], details: { error: "not found" } };

    task.resultSeen = true;
    updateFooter();

    let output = getSummary(task);
    if (task.stdout) output += `\n\nSTDOUT:\n${task.stdout}`;
    if (task.stderr) output += `\n\nSTDERR:\n${task.stderr}`;

    return { content: [{ type: "text", text: output }], details: task };
  },
});

const cancelBackgroundTaskTool = defineTool({
  name: "cancel-background-task",
  label: "Cancel Task",
  description: "Cancel a running, pending, queued, or recurring background task",
  promptSnippet: "Cancel running, pending, queued, or recurring background tasks by ID",
  promptGuidelines: [
    "Use cancel-background-task when the user wants to stop a running or recurring task.",
    "Only pending, running, queued, or recurring tasks can be cancelled.",
  ],
  parameters: Type.Object({ taskId: Type.String({ description: "The task ID to cancel" }) }),

  async execute(_id, params) {
    const task = manager.getTask(params.taskId);
    if (!task) return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], details: { error: "not found" } };

    if (!["pending", "running", "queued", "recurring"].includes(task.status)) {
      return { content: [{ type: "text", text: `Cannot cancel task in status: ${task.status}` }], details: { error: `Task is ${task.status}` } };
    }

    runner.cancel(params.taskId);
    manager.cancelTask(params.taskId);
    updateFooter();

    return { content: [{ type: "text", text: `Cancelled: "${task.name}"` }], details: task };
  },
});

// ── Commands ──────────────────────────────────────────────────────────
export default function (piArg: ExtensionAPI) {
  pi = piArg;
  pi.registerTool(runBackgroundTaskTool);
  pi.registerTool(runRecurringTaskTool);
  pi.registerTool(listBackgroundTasksTool);
  pi.registerTool(getBackgroundTaskResultTool);
  pi.registerTool(cancelBackgroundTaskTool);

  pi.registerCommand("tasks", {
    description: "Show background task status",
    handler: async (_args, ctx) => {
      const list = manager.getTasks();
      const running = list.filter((t) => ["running", "pending", "queued", "recurring"].includes(t.status)).length;
      const completed = list.filter((t) => t.status === "completed").length;
      const failed = list.filter((t) => t.status === "failed").length;
      if (list.length === 0) ctx.ui.notify("No background tasks", "info");
      else ctx.ui.notify(`${running} active, ${completed} completed, ${failed} failed`, "info");
    },
  });

  pi.registerCommand("run-task", {
    description: "Run a background task: /run-task <name> <command>",
    handler: async (args) => {
      if (!args) { pi!.sendMessage({ customType: "background-task", content: "Usage: /run-task <name> <command>", display: true }); return; }
      const parts = args.match(/^(\S+)\s+(.+)$/);
      if (!parts) { pi!.sendMessage({ customType: "background-task", content: "Usage: /run-task <name> <command>", display: true }); return; }
      const [, name, command] = parts;
      const task = manager.createBackground({ name, command, timeout: 300 });
      runner.run(task);
      updateFooter();
      pi!.sendMessage({ customType: "background-task", content: `Started: "${name}" (${task.id})`, display: true, details: { taskId: task.id } });
    },
  });

  pi.registerCommand("list-tasks", {
    description: "List all background tasks and their status",
    handler: async () => {
      const list = manager.getTasks();
      if (list.length === 0) { pi!.sendMessage({ customType: "background-task", content: "No background tasks.", display: true }); return; }
      for (const t of list) { if (t.status === "completed" || t.status === "failed") t.resultSeen = true; }
      updateFooter();
      let output = `Tasks (${list.length}):\n`;
      for (const t of list) {
        output += `${getSummary(t)}\n`;
        if (t.stdout) output += `  STDOUT: ${t.stdout.trim().split("\n").slice(0, 3).join(" | ")}\n`;
      }
      pi!.sendMessage({ customType: "background-task", content: output, display: true, details: { count: list.length } });
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    updateFooter();
  });

  pi.on("session_shutdown", async () => {
    currentCtx = null;
    runner.cancelAll();
  });

  pi.on("agent_start", async (_event, ctx) => {
    currentCtx = ctx;
    isAgentIdle = false;
    updateFooter();
  });

  pi.on("agent_end", async (_event, ctx) => {
    currentCtx = ctx;
    isAgentIdle = true;
    updateFooter();
    flushNotifications();
  });
}
