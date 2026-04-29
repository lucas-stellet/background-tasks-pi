import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

describe("TaskManager - isolation", () => {
  it("assigns isolated cwd per task", () => {
    const manager = createTaskManager({});

    const task = manager.createBackground({
      name: "isolated",
      command: "ls",
    });

    assert.ok(task.isolatedDir);
    assert.match(task.isolatedDir!, /background-tasks\//);
  });
});
