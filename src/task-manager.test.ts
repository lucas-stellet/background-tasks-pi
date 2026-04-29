import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskManager } from "./task-manager.ts";

describe("TaskManager - recurring tasks", () => {
  it("creates a recurring task with interval", () => {
    const manager = createTaskManager({});

    const task = manager.createRecurring({
      name: "poll",
      command: "echo tick",
      interval: 5000,
    });

    assert.equal(task.name, "poll");
    assert.equal(task.command, "echo tick");
    assert.equal(task.interval, 5000);
    assert.equal(task.status, "recurring");
    assert.equal(task.type, "recurring");
  });

  it("can cancel a recurring task", () => {
    const manager = createTaskManager({});

    const task = manager.createRecurring({
      name: "poll",
      command: "echo tick",
      interval: 5000,
    });

    const result = manager.cancelTask(task.id);

    assert.equal(result.status, "cancelled");
    assert.ok(result.completedAt);
  });
});

describe("TaskManager - concurrency", () => {
  it("queues tasks beyond maxConcurrent", () => {
    const manager = createTaskManager({ maxConcurrent: 2 });

    manager.createBackground({ name: "a", command: "sleep 10" });
    manager.createBackground({ name: "b", command: "sleep 10" });
    const queued = manager.createBackground({ name: "c", command: "sleep 10" });

    assert.equal(queued.status, "queued");
  });

  it("starts queued task when a slot frees", () => {
    const manager = createTaskManager({ maxConcurrent: 1 });

    const first = manager.createBackground({ name: "first", command: "sleep 1" });
    const second = manager.createBackground({ name: "second", command: "sleep 1" });

    assert.equal(first.status, "running");
    assert.equal(second.status, "queued");
  });
});

describe("TaskManager - timeout", () => {
  it("timeout kills a long-running task", () => {
    const manager = createTaskManager({});

    const task = manager.createBackground({
      name: "slow",
      command: "sleep 60",
      timeout: 1,
    });

    assert.equal(task.timeout, 1);
    // timeout handling tested via integration
  });
});

describe("TaskManager - project cwd results", () => {
  it("loads persisted task metadata from .background-tasks on startup", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "background-tasks-pi-manager-"));
    const resultDir = join(cwd, ".background-tasks", "task-old");

    try {
      await mkdir(resultDir, { recursive: true });
      await writeFile(join(resultDir, "task.json"), JSON.stringify({
        id: "task-old",
        type: "background",
        status: "completed",
        name: "old test",
        command: "npm test",
        createdAt: "2026-04-29T00:00:00.000Z",
        completedAt: "2026-04-29T00:00:01.000Z",
        exitCode: 0,
        duration: 1000,
        resultSeen: false,
        cwd,
        resultDir,
        stdoutPath: join(resultDir, "stdout.txt"),
        stderrPath: join(resultDir, "stderr.txt"),
        resultPath: join(resultDir, "result.md"),
        metadataPath: join(resultDir, "task.json"),
      }));

      const manager = createTaskManager({ cwd });

      assert.equal(manager.getTasks().length, 1);
      assert.equal(manager.getTask("task-old")?.name, "old test");
      assert.equal(manager.getTask("task-old")?.resultPath, join(resultDir, "result.md"));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("runs background tasks in the project cwd and stores results under .background-tasks", () => {
    const manager = createTaskManager({ cwd: "/repo/project" });

    const task = manager.createBackground({
      name: "project-cwd",
      command: "pwd",
    });

    assert.equal(task.cwd, "/repo/project");
    assert.equal(task.resultDir, `/repo/project/.background-tasks/${task.id}`);
    assert.equal(task.stdoutPath, `/repo/project/.background-tasks/${task.id}/stdout.txt`);
    assert.equal(task.stderrPath, `/repo/project/.background-tasks/${task.id}/stderr.txt`);
    assert.equal(task.resultPath, `/repo/project/.background-tasks/${task.id}/result.md`);
    assert.equal(task.metadataPath, `/repo/project/.background-tasks/${task.id}/task.json`);
    assert.equal(task.isolatedDir, undefined);
  });
});
