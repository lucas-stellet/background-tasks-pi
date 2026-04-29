import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFooterText } from "./footer.ts";

function task(overrides: Record<string, any> = {}): any {
  return {
    id: "test-1",
    type: "background",
    status: "running",
    name: "test",
    command: "echo ok",
    createdAt: new Date().toISOString(),
    resultSeen: false,
    ...overrides,
  };
}

describe("buildFooterText", () => {
  it("returns undefined for no tasks", () => {
    assert.equal(buildFooterText([]), undefined);
  });

  it("shows single running task", () => {
    const result = buildFooterText([task({ status: "running", name: "build" })]);
    assert.equal(result, '📋 "build" running');
  });

  it("shows two running tasks", () => {
    const result = buildFooterText([
      task({ status: "running", name: "build" }),
      task({ status: "running", name: "test" }),
    ]);
    assert.equal(result, '📋 "build" running, "test" running');
  });

  it("shows count for 3+ running", () => {
    const result = buildFooterText([
      task({ status: "running", name: "a" }),
      task({ status: "running", name: "b" }),
      task({ status: "running", name: "c" }),
    ]);
    assert.equal(result, '📋 "a" running, "b" running, 1 running');
  });

  it("shows completed count", () => {
    const result = buildFooterText([
      task({ status: "running", name: "build" }),
      task({ status: "completed", name: "done" }),
    ]);
    assert.equal(result, '📋 "build" running, 1 completed');
  });

  it("includes recurring tasks as running", () => {
    const result = buildFooterText([
      task({ type: "recurring", status: "recurring", name: "watch" }),
    ]);
    assert.equal(result, '📋 🔄 "watch" running');
  });

  it("mixes recurring and background running", () => {
    const result = buildFooterText([
      task({ type: "recurring", status: "recurring", name: "watch" }),
      task({ status: "running", name: "build" }),
    ]);
    assert.equal(result, '📋 🔄 "watch" running, "build" running');
  });

  it("recurring never shows as completed", () => {
    const result = buildFooterText([
      task({ type: "recurring", status: "recurring", name: "watch" }),
      task({ status: "completed", name: "done" }),
    ]);
    assert.equal(result, '📋 🔄 "watch" running, 1 completed');
  });

  it("excludes seen tasks", () => {
    const result = buildFooterText([
      task({ status: "running", name: "build" }),
      task({ status: "completed", name: "done", resultSeen: true }),
    ]);
    assert.equal(result, '📋 "build" running');
  });

  it("shows recurring tasks even when alone", () => {
    const result = buildFooterText([
      task({ type: "recurring", status: "recurring", name: "watch" }),
    ]);
    assert.ok(result);
    assert.equal(result, '📋 🔄 "watch" running');
  });

  it("shows only completed when no running", () => {
    const result = buildFooterText([
      task({ status: "completed", name: "a" }),
      task({ status: "completed", name: "b" }),
    ]);
    assert.equal(result, '📋 2 completed');
  });

  it("includes emoji even for single task", () => {
    const result = buildFooterText([task({ status: "running", name: "solo" })]);
    assert.ok(result?.startsWith("📋"));
  });
});
