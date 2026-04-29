import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Task, TaskStatus } from "./task-manager.ts";

export interface TaskRunnerCallbacks {
  onTaskStart: (task: Task) => void;
  onTaskComplete: (task: Task) => void;
  onTaskError: (task: Task, error: string) => void;
  onRecurringCycle: (task: Task) => void;
}

const MAX_OUTPUT_PREVIEW_BYTES = 64 * 1024;

export function createTaskRunner(callbacks: TaskRunnerCallbacks) {
  const childProcesses = new Map<string, ChildProcess>();

  function ensureResultPaths(task: Task): void {
    const cwd = task.cwd ?? process.cwd();
    const resultDir = task.resultDir ?? join(cwd, ".background-tasks", task.id);
    task.cwd = cwd;
    task.resultDir = resultDir;
    task.stdoutPath ??= join(resultDir, "stdout.txt");
    task.stderrPath ??= join(resultDir, "stderr.txt");
    task.resultPath ??= join(resultDir, "result.md");
    task.metadataPath ??= join(resultDir, "task.json");
  }

  async function persistTaskMetadata(task: Task): Promise<void> {
    ensureResultPaths(task);
    await mkdir(task.resultDir!, { recursive: true });
    await writeFile(task.metadataPath!, JSON.stringify(task, null, 2) + "\n");
    await writeFile(task.resultPath!, formatResult(task));
  }

  function appendPreview(current: string, chunk: string): string {
    const next = current + chunk;
    if (Buffer.byteLength(next) <= MAX_OUTPUT_PREVIEW_BYTES) return next;
    return next.slice(-MAX_OUTPUT_PREVIEW_BYTES);
  }

  async function endStream(stream: WriteStream): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      stream.once("error", reject);
      stream.end(resolve);
    });
  }

  function formatResult(task: Task): string {
    const lines = [
      `# ${task.name}`,
      "",
      `id: ${task.id}`,
      `status: ${task.status}`,
      `exitCode: ${task.exitCode ?? "-"}`,
      `durationMs: ${task.duration ?? "-"}`,
      `command: ${task.command}`,
      `cwd: ${task.cwd ?? process.cwd()}`,
      `stdout: ${task.stdoutPath ?? "-"}`,
      `stderr: ${task.stderrPath ?? "-"}`,
      "",
    ];

    if (task.error) lines.push(`error: ${task.error}`, "");
    return lines.join("\n");
  }

  async function run(task: Task): Promise<void> {
    ensureResultPaths(task);
    await mkdir(task.resultDir!, { recursive: true });

    // Don't start if already cancelled
    if (task.status === "cancelled") return;

    task.status = "running";
    task.startedAt = new Date().toISOString();
    callbacks.onTaskStart(task);
    await writeFile(task.stdoutPath!, "");
    await writeFile(task.stderrPath!, "");
    await persistTaskMetadata(task);

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    const stdoutStream = createWriteStream(task.stdoutPath!, { flags: "w" });
    const stderrStream = createWriteStream(task.stderrPath!, { flags: "w" });

    const cwd = task.cwd ?? process.cwd();
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

    child.stdout?.on("data", (data: Buffer) => {
      stdout = appendPreview(stdout, data.toString());
      stdoutStream.write(data);
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr = appendPreview(stderr, data.toString());
      stderrStream.write(data);
    });

    child.on("close", async (code: number | null) => {
      clearTimeout(timeoutId);
      childProcesses.delete(task.id);

      if (task.type === "recurring") {
        // Don't reset if cancelled while running
        if (task.status === "cancelled") return;
        // Recurring tasks reset status and update output for inspection
        task.status = "recurring";
        task.exitCode = code ?? undefined;
        task.stdout = stdout;
        task.stderr = stderr;
        task.duration = Date.now() - startTime;
        await Promise.all([endStream(stdoutStream), endStream(stderrStream)]);
        await persistTaskMetadata(task);
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

      await Promise.all([endStream(stdoutStream), endStream(stderrStream)]);
      await persistTaskMetadata(task);
      if (status === "completed") {
        callbacks.onTaskComplete(task);
      } else {
        callbacks.onTaskError(task, task.error ?? "unknown error");
      }
    });

    child.on("error", async (error: Error) => {
      clearTimeout(timeoutId);
      childProcesses.delete(task.id);
      task.status = "failed";
      task.completedAt = new Date().toISOString();
      task.error = error.message;
      task.duration = Date.now() - startTime;
      await Promise.all([endStream(stdoutStream), endStream(stderrStream)]);
      await persistTaskMetadata(task);
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
