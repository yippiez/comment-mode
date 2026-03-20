/**
 * Text utilities for the TUI: measures display widths, wraps/truncates
 * labels, and formats code/file-tree lines for rendering.
 */
import type { AgentUpdate } from "../types";

/**
 * Calculates the display width of text, accounting for ANSI escape codes and
 * full-width characters (like CJK characters which occupy 2 cells).
 *
 * @param text - The text to measure
 * @returns The display width in cells
 *
 * @example
 * displayWidth("hello")     // 5
 * displayWidth("你好")      // 4 (each CJK char is 2 cells)
 * displayWidth("\x1b[31m") // 0 (ANSI codes have no width)
 */
export function displayWidth(text: string): number {
    try {
        return Bun.stringWidth(text);
    } catch {
        return text.length;
    }
}

/**
 * Truncates a label from the left side, appending an ellipsis to show
 * that text was removed. Useful for displaying labels that are too long.
 *
 * @param label - The label to truncate
 * @param maxWidth - Maximum display width allowed
 * @returns The truncated label with "..." appended, or the original if it fits
 *
 * @example
 * truncateLeftLabel("Hello World", 20)    // "Hello World" (fits)
 * truncateLeftLabel("Hello World", 8)     // "Hello..."
 * truncateLeftLabel("Hi", 3)             // "Hi"
 * truncateLeftLabel("Hello", 2)          // "H"
 */
export function truncateLeftLabel(label: string, maxWidth: number): string {
    if (displayWidth(label) <= maxWidth) { return label; }
    if (maxWidth <= 3) {
        let compact = "";
        for (const char of label) {
            if (displayWidth(compact + char) > maxWidth) { break; }
            compact += char;
        }
        return compact;
    }

    const ellipsis = "...";
    const target = Math.max(1, maxWidth - displayWidth(ellipsis));
    let truncated = "";
    for (const char of label) {
        if (displayWidth(truncated + char) > target) { break; }
        truncated += char;
    }
    return `${truncated}${ellipsis}`;
}

/**
 * Wraps text to a specified width by breaking lines at word boundaries
 *
 * @param text - The text to wrap
 * @param width - Maximum width per line
 * @returns Array of wrapped lines
 *
 * @example
 * wrapTextToWidth("Hello World", 5)   // ["Hello", " World"]
 * wrapTextToWidth("Hi\nThere", 10)   // ["Hi", "There"]
 * wrapTextToWidth("test", 100)        // ["test"]
 */
export function wrapTextToWidth(text: string, width: number): string[] {
    const safeWidth = Math.max(1, Math.floor(width));
    const normalized = text.replace(/\t/g, "  ");
    const lines = normalized.split("\n");
    const wrapped: string[] = [];

    for (const line of lines) {
        if (line.length === 0) {
            wrapped.push("");
            continue;
        }

        let segment = "";
        for (const char of line) {
            const next = `${segment}${char}`;
            if (displayWidth(next) > safeWidth) {
                wrapped.push(segment.length > 0 ? segment : char);
                segment = segment.length > 0 ? char : "";
                continue;
            }
            segment = next;
        }
        if (segment.length > 0) {
            wrapped.push(segment);
        }
    }

    return wrapped.length > 0 ? wrapped : [""];
}

/**
 * Estimates the number of lines needed to display text at a given width.
 * Useful for pre-allocating buffers or calculating layout.
 *
 * @param text - The text to measure
 * @param width - The display width constraint
 * @returns Estimated number of lines (minimum 1)
 *
 * @example
 * estimateWrappedLines("Hello World", 5)  // 2
 * estimateWrappedLines("Hi", 10)          // 1
 * estimateWrappedLines("ab cd ef", 3)     // 3
 */
export function estimateWrappedLines(text: string, width: number): number {
    if (width <= 1) { return 1; }
    const normalized = text.replace(/\t/g, "    ");
    const lines = normalized.length === 0 ? [""] : normalized.split("\n");
    let total = 0;
    for (const line of lines) {
        const segmentLength = Math.max(1, displayWidth(line));
        total += Math.max(1, Math.ceil(segmentLength / width));
    }
    return Math.max(1, total);
}

/**
 * Counts the number of logical lines in a string.
 * Empty content returns 1 to represent a single empty line.
 *
 * @param content - The text content to count lines in
 * @returns Number of lines (minimum 1)
 *
 * @example
 * countLogicalLines("")           // 1
 * countLogicalLines("a")         // 1
 * countLogicalLines("a\nb")      // 2
 * countLogicalLines("a\nb\nc")   // 3
 */
export function countLogicalLines(content: string): number {
    if (content.length === 0) { return 1; }
    return content.split("\n").length;
}

/**
 * Converts a value to a trimmed string, but only if it's non-empty.
 * Useful for optional form fields where empty strings should be undefined.
 *
 * @param value - The value to convert
 * @returns The trimmed string if non-empty, otherwise undefined
 *
 * @example
 * toNonEmptyTrimmedString("  hello  ") // "hello"
 * toNonEmptyTrimmedString("")          // undefined
 * toNonEmptyTrimmedString("   ")       // undefined
 * toNonEmptyTrimmedString(123)         // undefined
 * toNonEmptyTrimmedString(null)        // undefined
 */
export function toNonEmptyTrimmedString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Normalizes line endings from persisted text by removing trailing carriage returns.
 * Handles CRLF vs LF differences when loading persisted content.
 *
 * @param value - The string to normalize (or null/undefined)
 * @returns The string with trailing \r removed, or null if input was null/undefined
 *
 * @example
 * normalizePersistedLineText("hello\r") // "hello"
 * normalizePersistedLineText("hello")   // "hello"
 * normalizePersistedLineText(null)      // null
 * normalizePersistedLineText("a\r\nb")  // "a\r\nb" (only trailing \r removed)
 */
export function normalizePersistedLineText(value: string | null): string | null {
    if (typeof value !== "string") { return null; }
    return value.endsWith("\r") ? value.slice(0, -1) : value;
}

/**
 * Formats a label as a single line of the specified width, centering the content and padding with spaces.
 *
 * If the trimmed label is longer than or equal to the width, it will be truncated. Otherwise, it will be centered with spaces.
 *
 * @param label - The text label to format.
 * @param width - The desired total width of the output line.
 * @returns The formatted, centered, single-line string of the specified width.
 *
 * @example
 * formatCollapsedContentLine("Example", 10) // "  Example  "
 * formatCollapsedContentLine("LongLabelText", 5) // "LongL"
 */
export function formatCollapsedContentLine(label: string, width: number): string {
    const trimmed = label.trim();
    if (trimmed.length >= width) { return trimmed.slice(0, width); }
    const remaining = width - trimmed.length;
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    return `${" ".repeat(left)}${trimmed}${" ".repeat(right)}`;
}

/**
 * Formats an AgentUpdate object as a concise, human-readable status line for display.
 *
 * Includes information about agent status, model, variant, prompt, runId, and error.
 * Each field is conditionally included if present/non-empty. Also handles prompt omission.
 *
 * @param update - The AgentUpdate object to format.
 * @returns A formatted string representing the agent's update state.
 *
 * @example
 * formatAgentUpdateLine({
 *   status: "completed",
 *   model: "gpt-4",
 *   prompt: "Generate code.",
 *   variant: "default",
 *   runId: "abc123",
 *   error: "",
 * })
 * // "● AGENT DONE · gpt-4 · think:default · Generate code. · abc123"
 */
export function formatAgentUpdateLine(update: AgentUpdate): string {
    const prefix =
        update.status === "running"
            ? "AGENT RUNNING"
            : update.status === "completed"
                ? "AGENT DONE"
                : update.status === "failed"
                    ? "AGENT FAILED"
                    : "AGENT DRAFT";
    const prompt = update.prompt.trim().length > 0 ? update.prompt : "<type prompt>";
    const variantSuffix = update.variant ? ` · think:${update.variant}` : "";
    const runSuffix = update.runId ? ` · ${update.runId}` : "";
    const errorSuffix = update.error ? ` | error: ${update.error}` : "";
    return `● ${prefix} · ${update.model}${variantSuffix} · ${prompt}${runSuffix}${errorSuffix}`;
}
