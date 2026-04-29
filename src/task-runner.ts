import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import type { Task, TaskStatus } from "./task-manager.ts";

export interface TaskRunnerCallbacks {
  onTaskStart: (task: Task) => void;
  onTaskComplete: (task: Task) => void;
  onTaskError: (task: Task, error: string) => void;
  onRecurringCycle: (task: Task) => void;
}

export function createTaskRunner(callbacks: TaskRunnerCallbacks) {
  const childProcesses = new Map<string, ChildProcess>();

  async function run(task: Task): Promise<void> {
    // Create isolated directory
    if (task.isolatedDir) {
      await mkdir(task.isolatedDir, { recursive: true });
    }

    task.status = "running";
    task.startedAt = new Date().toISOString();
    callbacks.onTaskStart(task);

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    const cwd = task.isolatedDir ?? process.cwd();
    const timeout = (task.timeout ?? 300) * 1000;

    const child = spawn("/bin/sh", ["-c", task.command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    childProcesses.set(task.id, child);

    const timeoutId = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeout);

    child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("close", (code: number | null) => {
      clearTimeout(timeoutId);
      childProcesses.delete(task.id);

      if (task.type === "recurring") {
        // Recurring tasks reset status and update output for inspection
        task.status = "recurring";
        task.exitCode = code ?? undefined;
        task.stdout = stdout;
        task.stderr = stderr;
        task.duration = Date.now() - startTime;
        callbacks.onRecurringCycle(task);
        return;
      }

      const status: TaskStatus = code === 0 ? "completed" : "failed";
      task.status = status;
      task.completedAt = new Date().toISOString();
      task.exitCode = code ?? undefined;
      task.stdout = stdout;
      task.stderr = stderr;
      task.duration = Date.now() - startTime;
      if (code !== 0) task.error = `exit code ${code}`;

      if (status === "completed") {
        callbacks.onTaskComplete(task);
      } else {
        callbacks.onTaskError(task, task.error ?? "unknown error");
      }
    });

    child.on("error", (error: Error) => {
      clearTimeout(timeoutId);
      childProcesses.delete(task.id);
      task.status = "failed";
      task.completedAt = new Date().toISOString();
      task.error = error.message;
      task.duration = Date.now() - startTime;
      callbacks.onTaskError(task, error.message);
    });
  }

  function cancel(id: string): boolean {
    const child = childProcesses.get(id);
    if (child) {
      child.kill("SIGTERM");
      childProcesses.delete(id);
      return true;
    }
    return false;
  }

  function cancelAll(): void {
    for (const [id, child] of childProcesses) {
      child.kill("SIGTERM");
      childProcesses.delete(id);
    }
  }

  return { run, cancel, cancelAll };
}
