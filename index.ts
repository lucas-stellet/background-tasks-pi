/**
 * Background Tasks Extension for pi
 *
 * Tools:
 *   run-background-task  — run a command once, returns immediately
 *   run-recurring-task   — run a command every N seconds until cancelled
 *   list-background-tasks — returns a textual task list for agents
 *   get-background-task-result — returns task output for agents
 *   cancel-background-task — cancel running/pending/recurring task
 *
 * Commands:
 *   /run-task <name> <cmd>
 *   /tasks — opens modal task browser
 *
 * Modal Navigation:
 *   ↑↓ — navigate between tasks or scroll detail
 *   Enter — open selected task detail
 *   Home/End — jump to first/last task
 *   x or d — cancel selected running task
 *   q/Esc — close modal
 *
 * Footer: shows up to 2 running tasks by name, + counts for rest
 * Notifications: queued when agent busy, delivered immediately when idle
 */

import { StringEnum, Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createTaskManager, type Task } from "./src/task-manager.ts";
import { createTaskRunner } from "./src/task-runner.ts";
import { buildFooterText } from "./src/footer.ts";
import { createNotificationQueue, type Notifier } from "./src/notifier.ts";
import { TaskBrowserModal } from "./src/task-browser-modal.ts";
import { filterTasks, formatTaskListForAgent, markFinishedTasksSeen } from "./src/task-utils.ts";

// ── State ────────────────────────────────────────────────────────────
let pi: ExtensionAPI | null = null;
let currentCtx: { ui: { setStatus: (id: string, text: string | undefined) => void } } | null = null;
let idle = true;

const notifier: Notifier = {
  isIdle: () => idle,
  sendMessage: (content) => {
    pi?.sendMessage({
      customType: "background-task",
      content,
      display: true,
      details: {},
    }, { deliverAs: "steer", triggerTurn: true });
  },
};

const queue = createNotificationQueue(notifier);

const manager = createTaskManager({ maxConcurrent: 5 });
const runner = createTaskRunner({
  onTaskStart() { updateFooter(); },
  onTaskComplete(task) {
    updateFooter();
    queue.notify(getSummary(task), "completed");
  },
  onTaskError(task, error) {
    updateFooter();
    queue.notify(`${task.name}: ${error}`, "failed");
  },
  onRecurringCycle(task) {
    updateFooter();
    queue.notify(`${task.name}: ${task.stdout?.trim() || "(no output)"}`, "recurring");
  },
});

// ── Helpers ───────────────────────────────────────────────────────────
function updateFooter(): void {
  if (!currentCtx) return;
  currentCtx.ui.setStatus("background-tasks", buildFooterText(manager.getTasks()));
}

function getSummary(task: Task): string {
  const emoji = task.status === "completed" ? "✓" : task.status === "failed" ? "✗" : task.status === "recurring" ? "🔄" : task.status === "cancelled" ? "⊘" : "⏳";
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
  description: "List all background tasks with their status as text for the agent.",
  promptSnippet: "List background tasks with status filter (all/active/completed/failed)",
  promptGuidelines: [
    "Use list-background-tasks when the user asks 'what tasks are running?' or wants to see background task status.",
    "The list-background-tasks tool returns text only; user-facing task browser widgets are available through the /tasks command.",
  ],
  parameters: Type.Object({
    filter: Type.Optional(StringEnum(["all", "active", "completed", "failed"] as const)),
  }),

  async execute(_id, params) {
    const taskList = filterTasks(manager.getTasks(), params.filter);

    markFinishedTasksSeen(taskList);
    updateFooter();

    return { content: [{ type: "text", text: formatTaskListForAgent(taskList) }], details: { count: taskList.length, tasks: taskList } };
  },
});

const getBackgroundTaskResultTool = defineTool({
  name: "get-background-task-result",
  label: "Get Task Result",
  description: "Get the result of a completed or failed background task as text for the agent.",
  promptSnippet: "Retrieve stdout/stderr from completed or failed background tasks",
  promptGuidelines: [
    "Use get-background-task-result when the user wants to see the output of a specific completed task.",
    "The get-background-task-result tool returns text only; user-facing task browser widgets are available through the /tasks command.",
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
    description: "Open task browser modal",
    handler: async (_args, ctx) => {
      const list = manager.getTasks();
      if (list.length === 0) {
        ctx.ui.notify("No background tasks", "info");
        return;
      }

      markFinishedTasksSeen(list);
      updateFooter();

      if (ctx.ui) {
        await ctx.ui.custom((tui, theme, _kb, done) => {
          const handleCancel = (taskId: string) => {
            const task = manager.getTask(taskId);
            if (task && ["pending", "running", "queued", "recurring"].includes(task.status)) {
              runner.cancel(taskId);
              manager.cancelTask(taskId);
              updateFooter();
            }
          };

          const modal = new TaskBrowserModal({
            tasks: list,
            tui,
            theme,
            onClose: () => done(undefined),
            onCancel: handleCancel,
          });

          return {
            render: (width: number) => modal.render(width),
            invalidate: () => modal.invalidate(),
            handleInput: (data: string) => {
              modal.handleInput(data);
              tui.requestRender();
            },
          };
        }, { overlay: true });
      }
    },
  });

  pi.registerCommand("run-task", {
    description: "Run a background task: /run-task <name> <command>",
    handler: async (args) => {
      if (!args) { pi!.sendMessage({ customType: "background-task", content: "Usage: /run-task <name> <command>", display: true }); return; }
      const parts = args.match(/^(\S+)\s+(.+)$/);
      if (!parts) { pi!.sendMessage({ customType: "background-task", content: "Usage: /run-task <name> <command>", display: true }); return; }
      const [, name, command] = parts;
      const cleanCommand = command.replace(/^(["'])(.*)\1$/, "$2");
      const task = manager.createBackground({ name, command: cleanCommand, timeout: 300 });
      runner.run(task);
      updateFooter();
      pi!.sendMessage({ customType: "background-task", content: `Started: "${name}" (${task.id})`, display: true, details: { taskId: task.id } });
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
    idle = false;
    updateFooter();
  });

  pi.on("agent_end", async (_event, ctx) => {
    currentCtx = ctx;
    idle = true;
    updateFooter();
    queue.flush();
  });
}
