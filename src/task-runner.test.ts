import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTaskRunner } from "./task-runner.ts";

describe("TaskRunner", () => {
  it("runs a command and calls onTaskComplete", async () => {
    let completedTask: any = null;

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
      command: "echo ok",
      timeout: 5,
      createdAt: new Date().toISOString(),
      resultSeen: false,
    };

    await runner.run(task);

    // Wait for process to finish
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(completedTask);
    assert.equal(completedTask.status, "completed");
    assert.equal(completedTask.exitCode, 0);
    assert.match(completedTask.stdout, /ok/);
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
