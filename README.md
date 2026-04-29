# background-tasks-pi

A pi extension for running shell commands in the background while you keep working in the chat.

It adds tools for one-off and recurring tasks, shows task state in the pi footer, and opens a keyboard-driven task browser for inspecting output or cancelling work.

## What it adds

### Tools

- `run-background-task`: run a shell command once and return immediately with a task ID.
- `run-recurring-task`: run a command every N seconds until cancelled.
- `list-background-tasks`: return a textual task list for agents, optionally filtered by status.
- `get-background-task-result`: return captured output for one task as text.
- `cancel-background-task`: stop a pending, running, queued, or recurring task.

### Commands

- `/run-task <name> <command>`: start a background command from the chat input.
- `/tasks`: open the task browser.

### UI behavior

- The footer shows active recurring tasks, running tasks, and finished tasks with unseen results.
- Finished task notifications are queued while the agent is busy and delivered when it becomes idle.
- Agent tools return text only; the interactive task browser is available through `/tasks`.
- The task browser lets you inspect status, command output, duration, IDs, and task details.

## Install

From this repository:

```bash
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

Run tests without blocking the conversation:

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

Cancel a task:

```text
Use cancel-background-task with:
taskId: task_...
```

## Task browser keys

- `up` / `down`: move through the task list or scroll details.
- `enter`: open the selected task detail view.
- `home` / `end`: jump to the first or last task.
- `pageup` / `pagedown`: scroll details faster.
- `x` or `d`: cancel the selected active task.
- `escape` or `q`: close the browser, or return from detail view to the list.

## Development

Run the test suite:

```bash
npm test
```

Project layout:

- `index.ts`: extension entry point, tool registration, commands, footer updates, and lifecycle hooks.
- `src/task-manager.ts`: task creation, task IDs, in-memory task storage, and status updates.
- `src/task-runner.ts`: shell process execution, output capture, timeouts, and cancellation.
- `src/task-browser-modal.ts`: task browser TUI.
- `src/footer.ts`: footer text formatting.
- `src/notifier.ts`: queued notification delivery.
- `src/task-utils.ts`: task filtering and result visibility helpers.

## Notes

Background tasks run through `/bin/sh -c`. Review commands before running them. Local pi packages and extensions execute with your normal system permissions.

One-off background tasks use isolated working directories under `/tmp/background-tasks/<task-id>`. Recurring tasks run from the current process working directory.

## License

MIT
