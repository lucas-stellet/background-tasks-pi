import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFooterText } from "./footer.ts";

function t(overrides: Record<string, any> = {}): any {
  return {
    id: "test-1", type: "background", status: "running", name: "test",
    command: "echo ok", createdAt: "2026-04-30T00:00:00.000Z", resultSeen: false,
    ...overrides,
  };
}

describe("buildFooterText", () => {
  it("returns undefined for no tasks", () => {
    assert.equal(buildFooterText([]), undefined);
  });

  // ── Ephemeral (📋) ──
  it("📋 single running", () => {
    assert.equal(buildFooterText([t({ name: "build" })]), '📋 "build" running');
  });

  it("📋 two running", () => {
    assert.equal(buildFooterText([t({ name: "a" }), t({ name: "b" })]), '📋 "a" running, "b" running');
  });

  it("📋 3+ running shows count", () => {
    assert.equal(buildFooterText([t({ name: "a" }), t({ name: "b" }), t({ name: "c" })]), '📋 "a" running, "b" running, 1 running');
  });

  it("📋 running excludes completed and failed tasks", () => {
    assert.equal(buildFooterText([
      t({ name: "b" }),
      t({ name: "d", status: "completed" }),
      t({ name: "f", status: "failed" }),
    ]), '📋 "b" running');
  });

  it("returns undefined for only completed and failed tasks", () => {
    assert.equal(buildFooterText([
      t({ name: "a", status: "completed" }),
      t({ name: "b", status: "failed" }),
    ]), undefined);
  });

  // ── Recurring (🔄) ──
  it("returns undefined for recurring tasks because they render in the tree", () => {
    assert.equal(buildFooterText([
      t({ type: "recurring", status: "recurring", name: "watch" }),
      t({ type: "recurring", status: "recurring", name: "poll" }),
    ]), undefined);
  });

  // ── Mixed (🔄 + 📋) ──
  it("📋 running excludes recurring, completed, and failed tasks", () => {
    assert.equal(buildFooterText([
      t({ type: "recurring", status: "recurring", name: "watch" }),
      t({ name: "build" }),
      t({ name: "done", status: "completed" }),
      t({ name: "broken", status: "failed" }),
    ]), '📋 "build" running');
  });

  it("excludes seen tasks", () => {
    assert.equal(buildFooterText([
      t({ name: "build" }),
      t({ name: "done", status: "completed", resultSeen: true }),
    ]), '📋 "build" running');
  });
});
