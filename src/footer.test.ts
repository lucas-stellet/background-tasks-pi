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
  it("🔄 single recurring", () => {
    assert.equal(buildFooterText([t({ type: "recurring", status: "recurring", name: "watch" })]), '🔄 "watch" recurring');
  });

  it("🔄 two recurring", () => {
    assert.equal(buildFooterText([
      t({ type: "recurring", status: "recurring", name: "watch" }),
      t({ type: "recurring", status: "recurring", name: "poll" }),
    ]), '🔄 "watch" recurring, "poll" recurring');
  });

  it("🔄 3+ recurring shows count", () => {
    assert.equal(buildFooterText([
      t({ type: "recurring", status: "recurring", name: "w" }),
      t({ type: "recurring", status: "recurring", name: "p" }),
      t({ type: "recurring", status: "recurring", name: "c" }),
    ]), '🔄 "w" recurring, "p" recurring, +1 more');
  });

  // ── Mixed (🔄 + 📋) ──
  it("🔄 recurring + 📋 running", () => {
    assert.equal(buildFooterText([
      t({ type: "recurring", status: "recurring", name: "watch" }),
      t({ name: "build" }),
    ]), '🔄 "watch" recurring  📋 "build" running');
  });

  it("🔄 recurring excludes completed and failed tasks", () => {
    assert.equal(buildFooterText([
      t({ type: "recurring", status: "recurring", name: "watch" }),
      t({ name: "done", status: "completed" }),
      t({ name: "broken", status: "failed" }),
    ]), '🔄 "watch" recurring');
  });

  it("🔄 2 recurring + 📋 running excludes completed and failed tasks", () => {
    assert.equal(buildFooterText([
      t({ type: "recurring", status: "recurring", name: "w" }),
      t({ type: "recurring", status: "recurring", name: "p" }),
      t({ name: "build" }),
      t({ name: "done", status: "completed" }),
      t({ name: "broken", status: "failed" }),
    ]), '🔄 "w" recurring, "p" recurring  📋 "build" running');
  });

  it("excludes seen tasks", () => {
    assert.equal(buildFooterText([
      t({ name: "build" }),
      t({ name: "done", status: "completed", resultSeen: true }),
    ]), '📋 "build" running');
  });
});
