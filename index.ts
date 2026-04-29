/**
 * Background Tasks Extension
 * 
 * Enables running scripts, code, and shell commands in the background.
 * Footer shows running/completed tasks (max 2, else "N tasks in background").
 * Tasks are removed from footer when their result is viewed.
 */

import { StringEnum, Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";

// Types
type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

interface BackgroundTask {
  id: string;
  name: string;
  command: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
  error?: string;
  resultSeen: boolean;
}

// State
const tasks = new Map<string, BackgroundTask>();
const childProcesses = new Map<string, ChildProcess>();
let taskIdCounter = 0;
let currentCtx: { ui: { setStatus: (id: string, text: string | undefined) => void } } | null = null;

// Notification queue
let pi: ExtensionAPI | null = null;
let isAgentIdle = true;
let pendingNotifications: Array<{ summary: string; status: string }> = [];

function notifyAgent(summary: string, status: string): void {
  pendingNotifications.push({ summary, status });
  if (isAgentIdle && pi) {
    // Agent is idle — wake up immediately
    const n = pendingNotifications.shift();
    if (!n) return;
    pi.sendMessage({
      customType: "background-task",
      content: `🔔 ${n.summary}`,
      display: true,
      details: {},
    }, { deliverAs: "steer", triggerTurn: true });
  }
  // If busy, notifications stay queued; delivered in agent_end
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

function generateTaskId(): string {
  return `task_${Date.now()}_${++taskIdCounter}`;
}

function getStatusEmoji(status: TaskStatus): string {
  switch (status) {
    case "completed": return "✓";
    case "failed": return "✗";
    case "running": return "⏳";
    case "cancelled": return "⊘";
    case "pending": return "○";
  }
}

function getTaskSummary(task: BackgroundTask): string {
  const emoji = getStatusEmoji(task.status);
  switch (task.status) {
    case "completed":
      const duration = task.duration ? ` in ${(task.duration / 1000).toFixed(1)}s` : "";
      return `${emoji} ${task.name}: exit ${task.exitCode}${duration}`;
    case "failed":
      return `${emoji} ${task.name}: ${task.error || "failed"}`;
    case "running":
      return `${emoji} ${task.name}: running...`;
    default:
      return `${emoji} ${task.name}: ${task.status}`;
  }
}

// Footer
function getVisibleTasks(): BackgroundTask[] {
  return Array.from(tasks.values())
    .filter((t) => !t.resultSeen && (t.status === "running" || t.status === "pending" || t.status === "completed" || t.status === "failed"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function buildFooterText(): string | undefined {
  const visible = getVisibleTasks();
  if (visible.length === 0) return undefined;

  const running = visible.filter((t) => t.status === "running" || t.status === "pending");
  const finished = visible.filter((t) => t.status === "completed" || t.status === "failed");

  let parts: string[] = [];

  // Show up to 2 running tasks by name
  const showRunning = running.slice(0, 2);
  for (const t of showRunning) {
    parts.push(`"${t.name}" running`);
  }
  const remainingRunning = running.length - showRunning.length;
  if (remainingRunning > 0) {
    parts.push(`${remainingRunning} running`);
  }

  // Show completed/failed count
  if (finished.length > 0) {
    parts.push(`${finished.length} completed`);
  }

  return `📋 ${parts.join(", ")}`;
}

function updateFooter(): void {
  if (!currentCtx) return;
  const text = buildFooterText();
  currentCtx.ui.setStatus("background-tasks", text);
}

function markResultSeen(taskId: string): void {
  const task = tasks.get(taskId);
  if (task) {
    task.resultSeen = true;
    updateFooter();
  }
}

function markAllResultsSeen(): void {
  for (const task of tasks.values()) {
    task.resultSeen = true;
  }
  updateFooter();
}

// Task runner
function runBackgroundTask(task: BackgroundTask): void {
  task.status = "running";
  task.startedAt = new Date().toISOString();
  updateFooter();

  const startTime = Date.now();
  let stdout = "";
  let stderr = "";

  const child = spawn("/bin/sh", ["-c", task.command], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  childProcesses.set(task.id, child);

  child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
  child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

  child.on("close", (code: number | null) => {
    childProcesses.delete(task.id);
    task.status = code === 0 ? "completed" : "failed";
    task.completedAt = new Date().toISOString();
    task.exitCode = code ?? undefined;
    task.stdout = stdout;
    task.stderr = stderr;
    task.duration = Date.now() - startTime;
    if (code !== 0) task.error = `exit code ${code}`;
    updateFooter();
    notifyAgent(getTaskSummary(task), task.status);
  });

  child.on("error", (error: Error) => {
    childProcesses.delete(task.id);
    task.status = "failed";
    task.completedAt = new Date().toISOString();
    task.error = error.message;
    task.duration = Date.now() - startTime;
    updateFooter();
    notifyAgent(getTaskSummary(task), "failed");
  });
}

// Tools
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
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const task: BackgroundTask = {
      id: generateTaskId(),
      name: params.name,
      command: params.command,
      status: "pending",
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    tasks.set(task.id, task);
    runBackgroundTask(task);

    return {
      content: [{ type: "text", text: `Started background task: ${task.name}\nTask ID: ${task.id}` }],
      details: { taskId: task.id, status: task.status },
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

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    let taskList = Array.from(tasks.values());

    if (params.filter === "active") {
      taskList = taskList.filter((t) => t.status === "pending" || t.status === "running");
    } else if (params.filter === "completed") {
      taskList = taskList.filter((t) => t.status === "completed");
    } else if (params.filter === "failed") {
      taskList = taskList.filter((t) => t.status === "failed");
    }

    // Mark all completed/failed tasks as seen
    markAllResultsSeen();

    if (taskList.length === 0) {
      return {
        content: [{ type: "text", text: "No background tasks found." }],
        details: { count: 0 },
      };
    }

    const summary = taskList.map(getTaskSummary).join("\n");
    return {
      content: [{ type: "text", text: `Background Tasks (${taskList.length}):\n${summary}` }],
      details: { count: taskList.length },
    };
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
  parameters: Type.Object({
    taskId: Type.String({ description: "The task ID" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const task = tasks.get(params.taskId);
    if (!task) {
      return {
        content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
        details: { error: "not found" },
      };
    }

    markResultSeen(params.taskId);

    let output = getTaskSummary(task);
    if (task.stdout) output += `\n\nSTDOUT:\n${task.stdout}`;
    if (task.stderr) output += `\n\nSTDERR:\n${task.stderr}`;

    return {
      content: [{ type: "text", text: output }],
      details: task,
    };
  },
});

const cancelBackgroundTaskTool = defineTool({
  name: "cancel-background-task",
  label: "Cancel Task",
  description: "Cancel a running or pending background task",
  promptSnippet: "Cancel running or pending background tasks by ID",
  promptGuidelines: [
    "Use cancel-background-task when the user wants to stop a running task.",
    "Only pending or running tasks can be cancelled — completed/failed tasks cannot.",
  ],
  parameters: Type.Object({
    taskId: Type.String({ description: "The task ID to cancel" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const task = tasks.get(params.taskId);
    if (!task) {
      return {
        content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
        details: { error: "not found" },
      };
    }

    if (task.status !== "pending" && task.status !== "running") {
      return {
        content: [{ type: "text", text: `Cannot cancel task in status: ${task.status}` }],
        details: { error: `Task is ${task.status}` },
      };
    }

    const child = childProcesses.get(params.taskId);
    if (child) {
      child.kill("SIGTERM");
      childProcesses.delete(params.taskId);
    }

    task.status = "cancelled";
    task.completedAt = new Date().toISOString();
    updateFooter();

    return {
      content: [{ type: "text", text: `Cancelled task: ${task.name}` }],
      details: task,
    };
  },
});

// Extension
export default function (piArg: ExtensionAPI) {
  pi = piArg;
  pi.registerTool(runBackgroundTaskTool);
  pi.registerTool(listBackgroundTasksTool);
  pi.registerTool(getBackgroundTaskResultTool);
  pi.registerTool(cancelBackgroundTaskTool);

  // Commands
  pi.registerCommand("tasks", {
    description: "Show background task status",
    handler: async (_args, ctx) => {
      const taskList = Array.from(tasks.values());
      const running = taskList.filter((t) => t.status === "running" || t.status === "pending");
      const completed = taskList.filter((t) => t.status === "completed").length;
      const failed = taskList.filter((t) => t.status === "failed").length;

      if (taskList.length === 0) {
        ctx.ui.notify("No background tasks", "info");
      } else {
        ctx.ui.notify(`${running.length} active, ${completed} completed, ${failed} failed`, "info");
      }
    },
  });

  pi.registerCommand("run-task", {
    description: "Run a background task: /run-task <name> <command>",
    handler: async (args) => {
      if (!args) {
        pi.sendMessage({ customType: "background-task", content: "Usage: /run-task <name> <command>", display: true });
        return;
      }

      const parts = args.match(/^(\S+)\s+(.+)$/);
      if (!parts) {
        pi.sendMessage({ customType: "background-task", content: "Usage: /run-task <name> <command>", display: true });
        return;
      }

      const [, name, command] = parts;
      const task: BackgroundTask = {
        id: generateTaskId(), name, command, status: "pending",
        createdAt: new Date().toISOString(), resultSeen: false,
      };

      tasks.set(task.id, task);
      runBackgroundTask(task);

      pi.sendMessage({
        customType: "background-task",
        content: `Started: "${name}" (${task.id})`,
        display: true,
        details: { taskId: task.id, name, command },
      });
    },
  });

  pi.registerCommand("list-tasks", {
    description: "List all background tasks and their status",
    handler: async () => {
      const taskList = Array.from(tasks.values());

      if (taskList.length === 0) {
        pi.sendMessage({ customType: "background-task", content: "No background tasks.", display: true });
        return;
      }

      markAllResultsSeen();

      let output = `Background Tasks (${taskList.length}):\n`;
      for (const task of taskList) {
        output += `${getTaskSummary(task)}\n`;
        if (task.stdout) {
          const lines = task.stdout.trim().split('\n').slice(0, 5).join('\n  ');
          if (lines) output += `  STDOUT: ${lines}\n`;
        }
      }

      pi.sendMessage({ customType: "background-task", content: output, display: true, details: { count: taskList.length } });
    },
  });

  // Lifecycle
  pi.on("session_start", async (_event, ctx) => {
    tasks.clear();
    childProcesses.clear();
    currentCtx = ctx;
    updateFooter();
  });

  pi.on("session_shutdown", async () => {
    currentCtx = null;
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
