/**
 * Background Tasks Extension for pi
 *
 * Tools:
 *   run-background-task  — run a command once from the project cwd, returns immediately
 *   run-recurring-task   — run a command from the project cwd every N seconds until cancelled
 *   list-background-tasks — returns a textual task list for agents
 *   get-background-task-status — returns live task status and recent output for agents
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
 *   Home/End — jump to first/last task; Home jumps to top in detail view; End follows output in detail view
 *   x or d — cancel selected running task
 *   f — follow output in detail view
 *   q/Esc — close modal
 *
 * Notifications: queued when agent busy, delivered immediately when idle
 */

import { StringEnum, Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createTaskManager, type Task } from "./src/task-manager.ts";
import { createTaskRunner } from "./src/task-runner.ts";
import { createNotificationQueue, type Notifier } from "./src/notifier.ts";
import { TaskBrowserModal } from "./src/task-browser-modal.ts";
import { loadTaskBrowserConfig, saveTaskBrowserConfig } from "./src/task-browser-config.ts";
import { filterTasks, formatTaskListForAgent, formatTaskStatusForAgent } from "./src/task-utils.ts";
import { createBackgroundTaskMessage } from "./src/background-task-message.ts";
import { createTaskTreeWidget } from "./src/task-tree-widget.ts";

// ── State ────────────────────────────────────────────────────────────
let pi: ExtensionAPI | null = null;
let currentCtx: { ui: { setStatus: (id: string, text: string | undefined) => void; setWidget?: (id: string, component: unknown) => void } } | null = null;
let idle = true;
let widgetTimer: ReturnType<typeof setInterval> | undefined;

const notifier: Notifier = {
  isIdle: () => idle,
  sendMessage: (content, status) => {
    const shouldWakeAgent = status === "completed" || status === "failed" || status === "mixed";
    pi?.sendMessage({
      customType: "background-task",
      content,
      display: true,
      details: { status },
    }, {
      deliverAs: "followUp",
      triggerTurn: shouldWakeAgent,
    });
  },
};

const queue = createNotificationQueue(notifier);

const manager = createTaskManager({ maxConcurrent: 5 });
const runner = createTaskRunner({
  onTaskStart(task) {
    manager.notifyTaskChanged(task);
    updateFooter();
  },
  onTaskOutput(task) {
    manager.notifyTaskChanged(task);
    updateTaskUi();
  }, 
  onTaskComplete(task) {
    manager.notifyTaskChanged(task);
    updateFooter();
    queue.notify(getSummary(task), "completed");
  },
  onTaskError(task, _error) {
    manager.notifyTaskChanged(task);
    updateFooter();
    queue.notify(getSummary(task), "failed");
  },
  onRecurringCycle(task) {
    manager.notifyTaskChanged(task);
    updateFooter();
    queue.notify(`${task.name}: ${task.stdout?.trim() || "(no output)"}`, "recurring");
  },
});

// ── Helpers ───────────────────────────────────────────────────────────
function hasLiveTreeTasks(tasks: Task[]): boolean {
  return tasks.some((task) => task.status === "running" || task.status === "recurring");
}

function syncWidgetTimer(tasks: Task[]): void {
  if (hasLiveTreeTasks(tasks)) {
    if (widgetTimer) return;
    widgetTimer = setInterval(() => updateTaskUi(), 1000);
    widgetTimer.unref?.();
    return;
  }
  if (widgetTimer) {
    clearInterval(widgetTimer);
    widgetTimer = undefined;
  }
}

function updateTaskUi(): void {
  const tasks = manager.getTasks();
  syncWidgetTimer(tasks);
  if (!currentCtx) return;
  currentCtx.ui.setStatus("background-tasks", undefined);
  currentCtx.ui.setWidget?.("background-tasks", createTaskTreeWidget(tasks));
}

function updateFooter(): void {
  updateTaskUi();
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
  description: "Run a shell command in the background from the project cwd. Results are written under .background-tasks/<task-id>. Returns immediately with a task ID.",
  promptSnippet: "Run long-running shell commands in background from the project cwd without blocking",
  promptGuidelines: [
    "Use run-background-task when the user asks to run a command that may take more than a few seconds: builds, tests, data processing, file searches, etc.",
    "Use run-background-task for any command the user explicitly asks to run in background or async.",
    "Background commands run from the project cwd, not an isolated temp directory.",
    "Results are saved under .background-tasks/<task-id>/ with task.json, result.md, stdout.txt, and stderr.txt.",
    "Always give the task a short, descriptive name so the user can identify it in notifications and task browser views.",
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
      content: [{ type: "text", text: `Started: "${task.name}" (${task.id})\nRunning in: ${task.cwd}\nResult: ${task.resultPath}` }],
      details: { taskId: task.id, status: task.status, cwd: task.cwd, resultPath: task.resultPath },
    };
  },
});

const runRecurringTaskTool = defineTool({
  name: "run-recurring-task",
  label: "Run Recurring Task",
  description: "Run a shell command from the project cwd every N seconds until cancelled. Results are written under .background-tasks/<task-id>. Use cancel-background-task to stop.",
  promptSnippet: "Run a command from the project cwd repeatedly at fixed intervals until cancelled",
  promptGuidelines: [
    "Use run-recurring-task when the user wants a command to run repeatedly on a schedule — e.g. polling a status, watching a file, periodic health checks.",
    "Recurring commands run from the project cwd, not an isolated temp directory.",
    "Results are saved under .background-tasks/<task-id>/ with task.json, result.md, stdout.txt, and stderr.txt.",
    "The task runs forever until cancelled with cancel-background-task.",
    "Give it a descriptive name so the user can identify it in notifications and task browser views.",
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
      content: [{ type: "text", text: `Started recurring: "${task.name}" every ${params.interval}s (${task.id})\nRunning in: ${task.cwd}\nResult: ${task.resultPath}` }],
      details: { taskId: task.id, status: "recurring", cwd: task.cwd, resultPath: task.resultPath },
    };
  },
});

const listBackgroundTasksTool = defineTool({
  name: "list-background-tasks",
  label: "List Background Tasks",
  description: "List current background tasks by default, or historical tasks with an explicit filter.",
  promptSnippet: "List current background tasks, or use a status filter (current/all/active/completed/failed)",
  promptGuidelines: [
    "Use list-background-tasks when the user asks 'what tasks are running?' or wants to see background task status.",
    "Without a filter, list only the current task section: active/recurring tasks plus unseen completed/failed tasks.",
    "Use filter: all only when the user explicitly asks for historical/old tasks.",
    "The list-background-tasks tool returns text only; the user-facing task browser is available through the /tasks command.",
  ],
  parameters: Type.Object({
    filter: Type.Optional(StringEnum(["current", "all", "active", "completed", "failed"] as const)),
  }),

  async execute(_id, params) {
    const taskList = filterTasks(manager.getTasks(), params.filter);

    return { content: [{ type: "text", text: formatTaskListForAgent(taskList) }], details: { count: taskList.length, tasks: taskList } };
  },
});

const getBackgroundTaskStatusTool = defineTool({
  name: "get-background-task-status",
  label: "Get Task Status",
  description: "Get live status and recent output for background tasks, including active/running task progress.",
  promptSnippet: "Inspect active/running task progress and recent stdout/stderr without waiting for completion",
  promptGuidelines: [
    "Use get-background-task-status when the user asks for active/running task progress or wants to inspect a background task before it finishes.",
    "Use get-background-task-status with taskId to get live stdout/stderr tails for a specific task.",
    "Use get-background-task-status without taskId to summarize matching background tasks.",
  ],
  parameters: Type.Object({
    taskId: Type.Optional(Type.String({ description: "Specific task ID to inspect" })),
    filter: Type.Optional(StringEnum(["all", "active", "completed", "failed"] as const)),
    tailLines: Type.Optional(Type.Number({ description: "Number of stdout/stderr tail lines to include (default: 20)" })),
  }),

  async execute(_id, params) {
    if (params.taskId) {
      const task = manager.getTask(params.taskId);
      if (!task) return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], details: { error: "not found" } };
      return {
        content: [{ type: "text", text: formatTaskStatusForAgent(task, { tailLines: params.tailLines }) }],
        details: task,
      };
    }

    const taskList = filterTasks(manager.getTasks(), params.filter ?? "active");
    if (taskList.length === 0) return { content: [{ type: "text", text: "No background tasks found." }], details: { count: 0, tasks: [] } };

    return {
      content: [{ type: "text", text: taskList.map((task) => formatTaskStatusForAgent(task, { tailLines: params.tailLines ?? 5 })).join("\n\n---\n\n") }],
      details: { count: taskList.length, tasks: taskList },
    };
  },
});

function formatPartialOutput(label: string, text: string | undefined, options: { tailLines?: number; maxBytes?: number }): string {
  if (!text) return "";
  let output = text;
  if (typeof options.tailLines === "number") output = output.trimEnd().split("\n").slice(-Math.max(0, options.tailLines)).join("\n");
  if (typeof options.maxBytes === "number" && Buffer.byteLength(output) > options.maxBytes) {
    const bytes = Buffer.from(output);
    output = bytes.subarray(Math.max(0, bytes.length - Math.max(0, options.maxBytes))).toString("utf8");
    output = `… truncated to last ${options.maxBytes} bytes\n${output}`;
  }
  return `\n\n${label}:\n${output}`;
}

const getBackgroundTaskResultTool = defineTool({
  name: "get-background-task-result",
  label: "Get Task Result",
  description: "Get the result of a completed or failed background task as text for the agent.",
  promptSnippet: "Retrieve stdout/stderr from completed or failed background tasks",
  promptGuidelines: [
    "Use get-background-task-result when the user wants to see the output of a specific completed task.",
    "Use tailLines or maxBytes for large outputs to inspect only part of the result and protect context.",
    "Calling this tool marks terminal tasks as seen in the task browser.",
    "The get-background-task-result tool returns text only; the user-facing task browser is available through the /tasks command."
  ],
  parameters: Type.Object({
    taskId: Type.String({ description: "The task ID" }),
    tailLines: Type.Optional(Type.Number({ description: "Only include the last N stdout/stderr lines" })),
    maxBytes: Type.Optional(Type.Number({ description: "Only include the last N bytes of stdout/stderr after line filtering" })),
  }),

  async execute(_id, params) {
    const task = manager.getTask(params.taskId);
    if (!task) return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], details: { error: "not found" } };

    manager.markTaskSeen(params.taskId);
    updateTaskUi();

    let output = getSummary(task);
    output += formatPartialOutput("STDOUT", task.stdout, { tailLines: params.tailLines, maxBytes: params.maxBytes });
    output += formatPartialOutput("STDERR", task.stderr, { tailLines: params.tailLines, maxBytes: params.maxBytes });

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

  pi.registerMessageRenderer("background-task", (message, _options, theme) => {
    const details = message.details as { status?: string } | undefined;
    return createBackgroundTaskMessage({
      content: String(message.content ?? ""),
      status: details?.status ?? "update",
      theme,
    });
  });

  pi.registerTool(runBackgroundTaskTool);
  pi.registerTool(runRecurringTaskTool);
  pi.registerTool(listBackgroundTasksTool);
  pi.registerTool(getBackgroundTaskStatusTool);
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

      const config = loadTaskBrowserConfig(manager.getCwd());

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

          let renderTimer: ReturnType<typeof setTimeout> | undefined;
          const scheduleTaskBrowserRender = () => {
            if (renderTimer) return;
            renderTimer = setTimeout(() => {
              renderTimer = undefined;
              tui.requestRender();
            }, 250);
          };
          const unsubscribe = manager.subscribe(() => scheduleTaskBrowserRender());
          const heartbeatId = setInterval(() => tui.requestRender(), 1000);
          const cleanup = () => {
            if (renderTimer) clearTimeout(renderTimer);
            clearInterval(heartbeatId);
            unsubscribe();
          };

          const modal = new TaskBrowserModal({
            getTasks: () => manager.getTasks(),
            preferences: config.taskBrowser,
            sessionStartedAt: manager.getSessionStartedAt(),
            tui,
            theme,
            onClose: () => {
              cleanup();
              done(undefined);
            },
            onCancel: handleCancel,
            onViewTask: (taskId: string) => {
              manager.markTaskSeen(taskId);
              updateTaskUi();
            },
            onPreferencesChange: (preferences) => saveTaskBrowserConfig(manager.getCwd(), preferences),
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
    if (widgetTimer) {
      clearInterval(widgetTimer);
      widgetTimer = undefined;
    }
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

    // pi still considers the agent active while agent_end listeners are running.
    // Defer finished-task wake-ups until the runtime has actually cleared activeRun,
    // and send one combined prompt so multiple completed tasks don't start
    // competing turns.
    setTimeout(() => {
      if (idle) queue.flushCombined();
    }, 0);
  });
}
