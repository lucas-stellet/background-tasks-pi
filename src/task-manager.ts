import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "recurring" | "queued";
export type TaskType = "background" | "recurring";

export interface TaskConfig {
  name: string;
  command: string;
  timeout?: number;
  delay?: number;
  interval?: number;
}

export interface Task extends TaskConfig {
  id: string;
  type: TaskType;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  stdoutBytes?: number;
  stderrBytes?: number;
  outputVersion?: number;
  updatedAt?: string;
  lastOutputAt?: string;
  duration?: number;
  error?: string;
  resultSeen: boolean;
  cwd?: string;
  resultDir?: string;
  stdoutPath?: string;
  stderrPath?: string;
  resultPath?: string;
  metadataPath?: string;
  isolatedDir?: string;
}

interface TaskManagerOptions {
  maxConcurrent?: number;
  cwd?: string;
}

function joinPath(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

let idCounter = 0;

function generateId(): string {
  return `task_${Date.now()}_${++idCounter}`;
}

export function createTaskManager(options: TaskManagerOptions) {
  const maxConcurrent = options.maxConcurrent ?? Infinity;
  const cwd = options.cwd ?? process.cwd();
  const sessionStartedAt = new Date().toISOString();
  const tasks = new Map<string, Task>();
  const subscribers = new Set<(task: Task) => void>();

  function resultPaths(id: string) {
    const resultDir = joinPath(cwd, ".background-tasks", id);
    return {
      cwd,
      resultDir,
      stdoutPath: joinPath(resultDir, "stdout.txt"),
      stderrPath: joinPath(resultDir, "stderr.txt"),
      resultPath: joinPath(resultDir, "result.md"),
      metadataPath: joinPath(resultDir, "task.json"),
    };
  }

  function persistTask(task: Task): void {
    const paths = resultPaths(task.id);
    task.cwd ??= paths.cwd;
    task.resultDir ??= paths.resultDir;
    task.stdoutPath ??= paths.stdoutPath;
    task.stderrPath ??= paths.stderrPath;
    task.resultPath ??= paths.resultPath;
    task.metadataPath ??= paths.metadataPath;

    mkdirSync(task.resultDir, { recursive: true });
    writeFileSync(task.metadataPath, JSON.stringify(task, null, 2) + "\n");
  }

  function isTerminal(task: Task): boolean {
    return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
  }

  function loadPersistedTasks(): void {
    const root = joinPath(cwd, ".background-tasks");
    if (!existsSync(root)) return;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const metadataPath = joinPath(root, entry.name, "task.json");
      if (!existsSync(metadataPath)) continue;

      try {
        const task = JSON.parse(readFileSync(metadataPath, "utf8")) as Task;
        if (!task.id || !task.name || !task.command) continue;

        if (["pending", "running", "queued", "recurring"].includes(task.status)) {
          task.status = "cancelled";
          task.completedAt ??= new Date().toISOString();
          task.error ??= "interrupted by previous session shutdown";
          persistTask(task);
        }

        tasks.set(task.id, task);
      } catch {
        // Ignore corrupt task metadata; one bad result should not break startup.
      }
    }
  }

  loadPersistedTasks();

  function runningCount(): number {
    let count = 0;
    for (const t of tasks.values()) {
      if (t.status === "running" || t.status === "pending") count++;
    }
    return count;
  }

  return {
    subscribe(listener: (task: Task) => void): () => void {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },

    notifyTaskChanged(task: Task): void {
      for (const listener of subscribers) listener(task);
    },

    createBackground(config: { name: string; command: string; timeout?: number; delay?: number }): Task {
      const id = generateId();
      const task: Task = {
        id,
        type: "background",
        status: runningCount() < maxConcurrent ? "running" : "queued",
        name: config.name,
        command: config.command,
        timeout: config.timeout,
        delay: config.delay,
        createdAt: new Date().toISOString(),
        resultSeen: false,
        ...resultPaths(id),
      };
      tasks.set(id, task);
      return task;
    },

    createRecurring(config: { name: string; command: string; interval: number }): Task {
      const id = generateId();
      const task: Task = {
        id,
        type: "recurring",
        status: "recurring",
        name: config.name,
        command: config.command,
        interval: config.interval,
        createdAt: new Date().toISOString(),
        resultSeen: false,
        ...resultPaths(id),
      };
      tasks.set(task.id, task);
      return task;
    },

    cancelTask(id: string): Task {
      const task = tasks.get(id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      persistTask(task);
      return task;
    },

    markTaskSeen(id: string): Task | undefined {
      const task = tasks.get(id);
      if (!task) return undefined;
      if (isTerminal(task)) {
        task.resultSeen = true;
        persistTask(task);
      }
      return task;
    },

    markTasksSeen(taskList: Task[]): void {
      for (const task of taskList) {
        this.markTaskSeen(task.id);
      }
    },

    getTask(id: string): Task | undefined {
      return tasks.get(id);
    },

    getTasks(): Task[] {
      return Array.from(tasks.values());
    },

    getSessionStartedAt(): string {
      return sessionStartedAt;
    },

    getCwd(): string {
      return cwd;
    },
  };
}
