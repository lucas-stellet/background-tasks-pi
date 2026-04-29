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
  duration?: number;
  error?: string;
  resultSeen: boolean;
  isolatedDir?: string;
}

interface TaskManagerOptions {
  maxConcurrent?: number;
}

let idCounter = 0;

function generateId(): string {
  return `task_${Date.now()}_${++idCounter}`;
}

export function createTaskManager(options: TaskManagerOptions) {
  const maxConcurrent = options.maxConcurrent ?? Infinity;
  const tasks = new Map<string, Task>();

  function runningCount(): number {
    let count = 0;
    for (const t of tasks.values()) {
      if (t.status === "running" || t.status === "pending") count++;
    }
    return count;
  }

  return {
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
        isolatedDir: `/tmp/background-tasks/${id}`,
      };
      tasks.set(id, task);
      return task;
    },

    createRecurring(config: { name: string; command: string; interval: number }): Task {
      const task: Task = {
        id: generateId(),
        type: "recurring",
        status: "recurring",
        name: config.name,
        command: config.command,
        interval: config.interval,
        createdAt: new Date().toISOString(),
        resultSeen: false,
      };
      tasks.set(task.id, task);
      return task;
    },

    cancelTask(id: string): Task {
      const task = tasks.get(id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      return task;
    },

    getTasks(): Task[] {
      return Array.from(tasks.values());
    },
  };
}
