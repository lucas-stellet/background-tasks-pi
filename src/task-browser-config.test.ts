import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TASK_BROWSER_PREFERENCES, loadTaskBrowserConfig, saveTaskBrowserConfig } from "./task-browser-config.ts";

describe("task browser config", () => {
  it("defaults to the current session with no status or search narrowing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "background-tasks-pi-config-"));

    try {
      assert.deepEqual(loadTaskBrowserConfig(cwd).taskBrowser, DEFAULT_TASK_BROWSER_PREFERENCES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("persists preferences under .background-tasks/config.json", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "background-tasks-pi-config-"));

    try {
      saveTaskBrowserConfig(cwd, { period: "7d", status: "failed", query: "precommit" });

      const raw = JSON.parse(await readFile(join(cwd, ".background-tasks", "config.json"), "utf8"));
      assert.deepEqual(raw.taskBrowser, { period: "7d", status: "failed", query: "precommit" });
      assert.deepEqual(loadTaskBrowserConfig(cwd).taskBrowser, { period: "7d", status: "failed", query: "precommit" });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("falls back to restrictive defaults when config is corrupt or invalid", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "background-tasks-pi-config-"));

    try {
      await mkdir(join(cwd, ".background-tasks"), { recursive: true });
      await writeFile(join(cwd, ".background-tasks", "config.json"), JSON.stringify({ taskBrowser: { period: "all", status: "bogus", query: 123 } }));

      assert.deepEqual(loadTaskBrowserConfig(cwd).taskBrowser, {
        period: "all",
        status: "all",
        query: "",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
