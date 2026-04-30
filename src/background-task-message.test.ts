import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBackgroundTaskMessage } from "./background-task-message.ts";

const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

const ansiPattern = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function terminalColumnWidth(line: string): number {
  let width = 0;
  for (const char of line.replace(ansiPattern, "")) {
    const codePoint = char.codePointAt(0) ?? 0;
    width += codePoint >= 0x1f300 ? 2 : 1;
  }
  return width;
}

describe("background task message renderer", () => {
  it("renders completed task notifications with English amber title", () => {
    // Arrange
    const component = createBackgroundTaskMessage({
      content: "🔔 scout: exit 0 in 1.2s",
      status: "completed",
      theme: fakeTheme,
    });

    // Act
    const lines = component.render(80);
    const output = lines.join("\n");

    // Assert
    assert.match(output, /Background task completed/);
    assert.match(output, /\x1b\[48;2;58;37;5m/);
    assert.match(output, /\x1b\[38;2;255;232;163m/);
  });

  it("renders failed task notifications with English failed title", () => {
    // Arrange
    const component = createBackgroundTaskMessage({
      content: "🔔 npm test: exit 1 in 18s",
      status: "failed",
      theme: fakeTheme,
    });

    // Act
    const output = component.render(80).join("\n");

    // Assert
    assert.match(output, /Background task failed/);
    assert.match(output, /npm test: exit 1/);
  });

  it("keeps rendered lines within the requested width", () => {
    // Arrange
    const component = createBackgroundTaskMessage({
      content: "🔔 a very long task name with a very long result path",
      status: "completed",
      theme: fakeTheme,
    });

    // Act
    const lines = component.render(20);

    // Assert
    assert.ok(lines.every((line) => terminalColumnWidth(line) <= 20));
  });

  it("keeps emoji-width header lines within the requested width", () => {
    // Arrange
    const component = createBackgroundTaskMessage({
      content: "short body",
      status: "completed",
      theme: fakeTheme,
    });

    // Act
    const lines = component.render(30);

    // Assert
    assert.ok(lines.every((line) => terminalColumnWidth(line) <= 30));
  });

  it("removes redundant notification headings and leading bell icons from the card body", () => {
    // Arrange
    const component = createBackgroundTaskMessage({
      content: [
        "🔔 Background task notifications:",
        "- ✓ amber notification smoke test: exit 0 in 0.0s",
        "Result: /tmp/result.md",
      ].join("\n"),
      status: "completed",
      theme: fakeTheme,
    });

    // Act
    const output = component.render(90).join("\n");

    // Assert
    assert.doesNotMatch(output, /Background task notifications:/);
    assert.match(output, /amber notification smoke test: exit 0/);
  });

  it("renders mixed batches with a neutral notifications title", () => {
    // Arrange
    const component = createBackgroundTaskMessage({
      content: "🔔 Background task notifications:\n1 failed, 1 completed\n- ✗ lint: exit code 1\n- ✓ test: exit 0 in 1.0s",
      status: "mixed",
      theme: fakeTheme,
    });

    // Act
    const output = component.render(80).join("\n");

    // Assert
    assert.match(output, /Background task notifications/);
    assert.doesNotMatch(output, /Background task failed/);
  });

  it("truncates long result paths by preserving the task directory and result filename", () => {
    // Arrange
    const component = createBackgroundTaskMessage({
      content: "Result: /Users/lucas/dev/projects/background-tasks-pi/.background-tasks/task_1777522809472_4/result.md",
      status: "completed",
      theme: fakeTheme,
    });

    // Act
    const output = component.render(70).join("\n");

    // Assert
    assert.match(output, /\.\.\/.background-tasks\/task_1777522809472_4\/result\.md/);
  });
});
