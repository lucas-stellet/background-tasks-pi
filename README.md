# background-tasks-pi

A pi extension for running shell commands in the background while you keep working in the chat.

Repository: https://github.com/lucas-stellet/background-tasks-pi

It adds tools for one-off and recurring tasks, shows task state in the pi footer, and opens a keyboard-driven task browser for following live output, inspecting final results, or cancelling work.

## What it adds

### Tools

- `run-background-task`: run a shell command once from the project cwd and return immediately with a task ID.
- `run-recurring-task`: run a command from the project cwd every N seconds until cancelled.
- `list-background-tasks`: return a textual task list for agents, optionally filtered by status.
- `get-background-task-status`: return live status, duration, byte counts, and recent stdout/stderr tails for running or finished tasks.
- `get-background-task-result`: return captured output for one task as text.
- `cancel-background-task`: stop a pending, running, queued, or recurring task.

### Commands

- `/run-task <name> <command>`: start a background command from the chat input.
- `/tasks`: open the task browser.

### UI behavior

- The footer shows active recurring tasks, running tasks, and finished tasks with unseen results.
- Finished task notifications are queued while the agent is busy and delivered when it becomes idle.
- Agent tools return text only; the interactive task browser is available through `/tasks`.
- The task browser updates live while open and lets you inspect status, command output, duration, IDs, and task details.
- Detail views follow live stdout/stderr while a task is running. When the task finishes, the open detail view refreshes to the completed, failed, or cancelled state without needing to leave and re-enter it.
- If output follow mode is active, task completion scrolls to the newest final content. If you paused follow mode by scrolling up, the browser preserves your position and keeps scrolling usable.
- Task results are saved under `.background-tasks/<task-id>/` in the project directory and reloaded on startup.

## Install

From GitHub:

```bash
git clone https://github.com/lucas-stellet/background-tasks-pi.git
cd background-tasks-pi
npm install
pi -e ./index.ts
```

To install it as a pi package from a local checkout:

```bash
pi install /absolute/path/to/background-tasks-pi
```

The package manifest declares the extension in `package.json`:

```json
{
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

## Usage examples

Run tests from the project cwd without blocking the conversation:

```text
Use run-background-task with:
name: test
command: npm test
timeout: 120
```

Start a recurring health check:

```text
Use run-recurring-task with:
name: health
command: curl -fsS http://localhost:3000/health
interval: 30
```

List active tasks from the agent:

```text
Use list-background-tasks with:
filter: active
```

Inspect live progress from the agent while a task is still running:

```text
Use get-background-task-status with:
taskId: task_...
tailLines: 20
```

Cancel a task:

```text
Use cancel-background-task with:
taskId: task_...
```

## Task browser

The task browser defaults to the current session so old task history does not overwhelm the list. Preferences are saved per project in `.background-tasks/config.json`.

Open it with `/tasks`, select a task, and press `enter` to view details. While a command is running, the detail view can follow live output. When the command reaches a terminal state, the same detail view updates its header, exit code, duration, and final output immediately.

In list view, `left` / `right` enters column sort mode and moves between `name`, `status`, `time`, and `id`. While sort mode is active, the footer changes to show its controls: `left` / `right` chooses the column, `enter` toggles ascending/descending order, and `escape` exits sort mode.

### Keys

- `up` / `down`: move through the task list or scroll details.
- `left` / `right` in list view: enter sort mode and move the active sort column.
- `enter` in sort mode: toggle ascending/descending order.
- `escape` in sort mode: return to normal list controls.
- `/`: search tasks by name, command, ID, or status.
- `p`: cycle period filter: `session`, `24h`, `7d`, `all`.
- `s`: cycle status filter: `all`, `active`, `completed`, `failed`, `cancelled`.
- `enter`: open the selected task detail view, or leave search mode.
- `home` / `end`: jump to the first or last task.
- `pageup` / `pagedown`: scroll details faster; scrolling upward pauses output follow mode.
- `f` or `end` in detail view: resume following live output and jump to the newest tail.
- `x` or `d`: cancel the selected active task.
- `escape`: clear/exit search, close the browser, or return from detail view to the list.
- `q`: close the browser.

## Development

Run the test suite:

```bash
npm test
```

Project layout:

- `index.ts`: extension entry point, tool registration, commands, footer updates, and lifecycle hooks.
- `src/task-manager.ts`: task creation, task IDs, in-memory task storage, and status updates.
- `src/task-runner.ts`: shell process execution, output capture, result-file writing, timeouts, and cancellation.
- `src/task-browser-modal.ts`: task browser TUI.
- `src/task-browser-state.ts`: task browser filtering, search, and column sorting state.
- `src/footer.ts`: footer text formatting.
- `src/notifier.ts`: queued notification delivery.
- `src/task-utils.ts`: task filtering and result visibility helpers.

## Notes

Background tasks run through `/bin/sh -c` from the project cwd. Review commands before running them. Local pi packages and extensions execute with your normal system permissions.

While a task is running, recent stdout/stderr are also kept in a bounded in-memory live buffer for fast status checks and `/tasks` refreshes. Full output remains on disk.

Each task writes files to `.background-tasks/<task-id>/`:

- `task.json`: task metadata.
- `result.md`: human-readable summary.
- `stdout.txt`: captured standard output.
- `stderr.txt`: captured standard error.

`.background-tasks/` is ignored by git. Completed results are reloaded when the extension starts again; stale active tasks from a previous session are marked as cancelled.

## License

MIT
