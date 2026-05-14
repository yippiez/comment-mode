# Context

## Product

`comment-mode` is a terminal-first agentic code review workflow. The user reviews the current workspace diff, selects code context, writes an instruction, and launches a coding agent to change the workspace. The diff feed refreshes as files change so the review loop stays anchored in the current Git/JJ change.

## Domain Vocabulary

- **Review Diff Feed** — the main ordered review surface built from the current workspace diff. It contains file headers, diff hunks, selectable changed/context lines, inline prompt composers, and agent run widgets.
- **Diff Hunk** — a contiguous changed region in the Review Diff Feed, with enough surrounding context to understand the change.
- **Review Selection** — a selected file/range in the Review Diff Feed. It is the user’s intended code context for an agent prompt.
- **Prompt Context** — the materialized context sent to an agent: the Review Selection, its file/range metadata, and relevant diff text.
- **Agent Adapter** — a concrete integration for a coding agent CLI, currently Pi and OpenCode.
- **Agent Run** — one launched agent task associated with a Prompt Context. It has lifecycle status, streaming events, and a best-effort anchor back into the Review Diff Feed.
- **Agent Run Event** — a normalized streaming event from an Agent Adapter, such as assistant text, thinking, tool call, tool result, status, usage, or error.
- **Inline Composer** — the prompt input opened inside the Review Diff Feed for the current Review Selection.

## First Working Loop

1. `comment` with no args opens the TUI.
2. The TUI shows a single Review Diff Feed from the current Git/JJ workspace diff.
3. The user navigates with vim-ish keys and selects line ranges.
4. `Enter` opens an Inline Composer at the selection.
5. The user toggles Pi/OpenCode, writes a prompt, and submits.
6. The selected Agent Adapter launches with `opencode-go/deepseek-v4-flash` by default.
7. Agent Run Events render as inline widgets.
8. Workspace changes refresh the Review Diff Feed live.

## Deferred From First Slice

- File explorer.
- Saved groups/chips.
- Theme cycling and visual polish beyond a readable default.
- Persisted review state across TUI restarts.
