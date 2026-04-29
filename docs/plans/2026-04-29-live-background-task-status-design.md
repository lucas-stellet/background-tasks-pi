# Live Background Task Status Design

## Goal

Let both the agent and the user inspect running background tasks in near real time without waiting for task completion.

## Architecture

Task output remains streamed to `.background-tasks/<task-id>/stdout.txt` and `stderr.txt` as the source of truth. A bounded in-memory live output buffer keeps recent stdout/stderr tails, byte counts, and an output version for fast UI/tool reads while a process is running. The task manager exposes lightweight change notifications so `/tasks` can rerender on throttled updates instead of polling files.

## Components

- `src/task-runner.ts`: append chunks to per-task live buffers, update task preview fields, byte counters, timestamps, output version, and notify callbacks.
- `src/task-manager.ts`: add live metadata fields to `Task` and a subscribe/notify API.
- `src/task-browser-modal.ts`: use `getTasks()` rather than a fixed list, support live refresh, and add follow-output behavior in detail view.
- `index.ts`: register `get-background-task-status` for agent-readable active status and wire `/tasks` subscriptions with throttled render.
- Tests: add RED/GREEN coverage for live buffer updates, agent status formatting, browser refresh source, and follow-scroll behavior.

## Performance

- Keep only 64KB per stream in memory per task.
- Do not persist `task.json` on every output chunk.
- Persist status transitions immediately; output files are written continuously.
- Throttle TUI renders on output updates to roughly 250ms; render immediately on status changes.
- Use a 1s heartbeat while the modal is open only to update running durations.

## Auto-scroll

Detail view starts in follow mode. New output jumps to the bottom. Manual upward scrolling pauses follow. `f` or `end` resumes follow and jumps to the bottom.
