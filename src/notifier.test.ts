import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createNotificationQueue, type Notifier } from "./notifier.ts";

describe("NotificationQueue", () => {
  it("delivers immediately when idle", () => {
    const delivered: string[] = [];

    const notifier: Notifier = {
      isIdle: () => true,
      sendMessage: (content) => { delivered.push(content); },
    };

    const queue = createNotificationQueue(notifier);
    queue.notify("task done", "completed");

    assert.equal(delivered.length, 1);
    assert.match(delivered[0], /🔔 task done/);
    assert.equal(queue.getPending().length, 0);
  });

  it("queues when busy, flushes on demand", () => {
    const delivered: string[] = [];

    const notifier: Notifier = {
      isIdle: () => false,
      sendMessage: (content) => { delivered.push(content); },
    };

    const queue = createNotificationQueue(notifier);
    queue.notify("task A", "completed");
    queue.notify("task B", "completed");

    // Not delivered yet
    assert.equal(delivered.length, 0);
    assert.equal(queue.getPending().length, 2);

    // Flush
    const flushed = queue.flush();
    assert.equal(flushed.length, 2);
    assert.equal(delivered.length, 2);
    assert.equal(queue.getPending().length, 0);
  });

  it("delivers first immediately, queues rest when busy", () => {
    const delivered: string[] = [];
    let idle = true;

    const notifier: Notifier = {
      isIdle: () => idle,
      sendMessage: (content) => { delivered.push(content); },
    };

    const queue = createNotificationQueue(notifier);

    // First — idle
    queue.notify("task 1", "completed");
    assert.equal(delivered.length, 1);

    // Go busy
    idle = false;
    queue.notify("task 2", "completed");
    queue.notify("task 3", "completed");
    assert.equal(delivered.length, 1); // only first delivered
    assert.equal(queue.getPending().length, 2);

    // Flush
    queue.flush();
    assert.equal(delivered.length, 3);
  });

  it("passes notification status to the notifier", () => {
    const delivered: Array<{ content: string; status: string }> = [];
    const notifier: Notifier = {
      isIdle: () => true,
      sendMessage: (content, status) => { delivered.push({ content, status }); },
    };

    const queue = createNotificationQueue(notifier);
    queue.notify("task done", "completed");

    assert.deepEqual(delivered, [{ content: "🔔 task done", status: "completed" }]);
  });

  it("does not deliver if queue is empty", () => {
    const delivered: string[] = [];
    const notifier: Notifier = {
      isIdle: () => true,
      sendMessage: (content) => { delivered.push(content); },
    };

    const queue = createNotificationQueue(notifier);
    const flushed = queue.flush();
    assert.equal(flushed.length, 0);
    assert.equal(delivered.length, 0);
  });
});
