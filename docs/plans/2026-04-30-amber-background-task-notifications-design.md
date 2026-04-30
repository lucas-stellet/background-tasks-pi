# Amber Background Task Notifications Design

## Goal
Make completed and failed background task notifications visually distinct from user messages, using English copy and an amber-styled custom message card.

## Context
Finished tasks currently call `pi.sendUserMessage(content, { deliverAs: "followUp" })`, which makes them look like user-authored messages. Pi supports custom session messages through `pi.sendMessage()` and custom TUI rendering through `pi.registerMessageRenderer(customType, renderer)`.

## Design
Use the existing `background-task` custom message type for terminal task notifications. Send completed and failed notifications with `pi.sendMessage({ customType: "background-task", display: true, details: { status } })` instead of `sendUserMessage()`. Register a renderer for `background-task` that displays terminal notifications as amber cards with English labels:

- `Background task completed` for completed tasks
- `Background task failed` for failed tasks
- `Background task update` for other statuses

The card uses an amber header/accent and warm dark body so it does not resemble a user message. The renderer preserves the notification body text and keeps lines within the available TUI width.

## Testing
Add unit/source tests that verify:

1. Finished task notifications no longer use `sendUserMessage(... followUp)`.
2. Finished task notifications use `sendMessage()` with `customType: "background-task"`, `display: true`, and status details.
3. The renderer outputs English completed/failed titles and amber ANSI colors.

## Acceptance Criteria
- `npm test` passes.
- Completed/failed background task notifications render as amber custom messages.
- Notification text is in English.
