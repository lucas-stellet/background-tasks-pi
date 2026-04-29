import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTaskRunner } from "./task-runner.ts";

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
}

describe("TaskRunner", () => {
  it("updates stdout preview before task completes", async () => {
    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: () => {},
      onTaskError: () => {},
      onRecurringCycle: () => {},
    });

    const task = {
      id: "live-1",
      type: "background" as const,
      status: "pending" as const,
      name: "live",
      command: "printf first; sleep 0.4; printf second",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    runner.run(task);

    const sawLiveOutput = await waitUntil(() => task.status === "running" && task.stdout === "first");

    assert.equal(sawLiveOutput, true);
    assert.equal(task.status, "running");
    assert.equal(task.stdoutBytes, 5);
    assert.equal(task.outputVersion, 1);
  });

  it("keeps live stdout preview bounded while tracking full byte count", async () => {
    let completedTask: any = null;
    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: (task) => { completedTask = task; },
      onTaskError: () => {},
      onRecurringCycle: () => {},
    });

    const task = {
      id: "live-2",
      type: "background" as const,
      status: "pending" as const,
      name: "bounded",
      command: "python3 - <<'PY'\nprint('a' * 70000, end='')\nPY",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    await runner.run(task);
    await waitUntil(() => completedTask !== null, 1500);

    assert.ok(completedTask);
    assert.equal(completedTask.stdoutBytes, 70000);
    assert.ok(Buffer.byteLength(completedTask.stdout) <= 64 * 1024);
  });

  it("clears previous live output when a task starts another run", async () => {
    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: () => {},
      onTaskError: () => {},
      onRecurringCycle: () => {},
    });

    const task = {
      id: "live-rerun",
      type: "recurring" as const,
      status: "recurring" as const,
      name: "rerun",
      command: "echo first",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    await runner.run(task);
    await waitUntil(() => task.status === "recurring" && task.stdout?.includes("first"));

    task.command = "sleep 0.2; echo second";
    runner.run(task);
    await waitUntil(() => task.status === "running");

    assert.equal(task.stdout, "");
    assert.equal(task.stderr, "");
    assert.equal(task.stdoutBytes, 0);
    assert.equal(task.stderrBytes, 0);
  });

  it("calls onTaskOutput for stdout and stderr chunks", async () => {
    const streams: string[] = [];
    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: () => {},
      onTaskError: () => {},
      onRecurringCycle: () => {},
      onTaskOutput: (_task, stream) => { streams.push(stream); },
    });

    const task = {
      id: "live-3",
      type: "background" as const,
      status: "pending" as const,
      name: "callbacks",
      command: "echo out; echo err >&2",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    await runner.run(task);
    await waitUntil(() => streams.includes("stdout") && streams.includes("stderr"));

    assert.deepEqual([...new Set(streams)].sort(), ["stderr", "stdout"]);
  });

  it("runs a command and writes result files under the project cwd", async () => {
    let completedTask: any = null;
    const cwd = await mkdtemp(join(tmpdir(), "background-tasks-pi-"));
    const resultDir = join(cwd, ".background-tasks", "test-1");

    try {
      const runner = createTaskRunner({
        onTaskStart: () => {},
        onTaskComplete: (task) => { completedTask = task; },
        onTaskError: () => {},
        onRecurringCycle: () => {},
      });

      const task = {
        id: "test-1",
        type: "background" as const,
        status: "pending" as const,
        name: "test",
        command: "pwd; echo ok; echo warn >&2",
        timeout: 5,
        createdAt: new Date().toISOString(),
        resultSeen: false,
        cwd,
        resultDir,
        stdoutPath: join(resultDir, "stdout.txt"),
        stderrPath: join(resultDir, "stderr.txt"),
        resultPath: join(resultDir, "result.md"),
        metadataPath: join(resultDir, "task.json"),
      };

      await runner.run(task);

      // Wait for process to finish
      await new Promise((resolve) => setTimeout(resolve, 500));

      assert.ok(completedTask);
      assert.equal(completedTask.status, "completed");
      assert.equal(completedTask.exitCode, 0);
      assert.match(completedTask.stdout, /ok/);
      assert.match(await readFile(task.stdoutPath, "utf8"), new RegExp(`${cwd}\\n.*ok`, "s"));
      assert.match(await readFile(task.stderrPath, "utf8"), /warn/);
      assert.match(await readFile(task.resultPath, "utf8"), /# test/);
      assert.match(await readFile(task.resultPath, "utf8"), /status: completed/);
      assert.match(await readFile(task.metadataPath, "utf8"), /"status": "completed"/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("reports failure for non-zero exit", async () => {
    let erroredTask: any = null;

    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: () => {},
      onTaskError: (task) => { erroredTask = task; },
      onRecurringCycle: () => {},
    });

    const task = {
      id: "test-2",
      type: "background" as const,
      status: "pending" as const,
      name: "fail",
      command: "exit 1",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    await runner.run(task);
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(erroredTask);
    assert.equal(erroredTask.status, "failed");
    assert.equal(erroredTask.exitCode, 1);
  });

  it("can cancel a running task", async () => {
    let completed = false;

    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: () => { completed = true; },
      onTaskError: () => {},
      onRecurringCycle: () => {},
    });

    const task = {
      id: "test-3",
      type: "background" as const,
      status: "pending" as const,
      name: "slow",
      command: "sleep 10",
      timeout: 30,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    runner.run(task);

    // Cancel after a tick
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cancelled = runner.cancel(task.id);

    assert.ok(cancelled);
    assert.ok(!completed);
  });

  it("calls onRecurringCycle for recurring tasks", async () => {
    let cycles: any[] = [];

    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: () => {},
      onTaskError: () => {},
      onRecurringCycle: (task) => { cycles.push({ name: task.name, status: task.status, stdout: task.stdout }); },
    });

    const task = {
      id: "test-4",
      type: "recurring" as const,
      status: "recurring" as const,
      name: "ticker",
      command: "echo tick",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    await runner.run(task);
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].status, "recurring");
    assert.match(cycles[0].stdout, /tick/);
  });

  it("does not reset cancelled recurring task", async () => {
    let cycles = 0;

    const runner = createTaskRunner({
      onTaskStart: () => {},
      onTaskComplete: () => {},
      onTaskError: () => {},
      onRecurringCycle: () => { cycles++; },
    });

    const task = {
      id: "test-5",
      type: "recurring" as const,
      status: "cancelled" as const, // was cancelled before runner finished
      name: "cancelled-ticker",
      command: "echo tick",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    await runner.run(task);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should NOT call onRecurringCycle because task was cancelled
    assert.equal(cycles, 0);
  });
});
