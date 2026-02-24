/**
 * Creates a centered text line padded with slashes on both sides.
 * @param label - The text to display in the center
 * @param width - Total width of the resulting string
 * @returns A string with slashes padding the centered label
 */
export function makeSlashLine(label: string, width: number): string {
  const safeLabel = label.replace(/\s+/g, " ").trim();
  const centered = ` ${safeLabel} `;
  const trimmed =
    centered.length > width ? `${centered.slice(0, Math.max(1, width - 1))} ` : centered;
  const remaining = Math.max(0, width - trimmed.length);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return "/".repeat(left) + trimmed + "/".repeat(right);
}

/**
 * Removes all children from a container object.
 * @param container - An object with getChildren() and remove(id) methods
 */
export function clearChildren(container: {
  getChildren: () => { id: string }[];
  remove: (id: string) => void;
}): void {
  for (const child of container.getChildren()) {
    container.remove(child.id);
  }
}

/**
 * Clamps a value between min and max bounds.
 * @param value - The value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The clamped value within [min, max] range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculates the display width of a string, accounting for wide characters.
 * Uses Bun.stringWidth for accurate width calculation, falls back to length.
 * @param text - The text string to measure
 * @returns The display width in character cells
 */
export function displayWidth(text: string): number {
  try {
    return Bun.stringWidth(text);
  } catch {
    return text.length;
  }
}

/**
 * Truncates a label from the left side, appending an ellipsis if truncated.
 * For very narrow widths (<=3), truncates without ellipsis.
 * @param label - The label string to truncate
 * @param maxWidth - The maximum width allowed
 * @returns The truncated label string
 * @example
 * truncateLeftLabel("Hello World", 8) // "Hello..."
 * @example
 * truncateLeftLabel("Hi", 10) // "Hi"
 * @example
 * truncateLeftLabel("Hello", 2) // "He"
 */
export function truncateLeftLabel(label: string, maxWidth: number): string {
  if (displayWidth(label) <= maxWidth) return label;
  if (maxWidth <= 3) {
    let compact = "";
    for (const char of label) {
      if (displayWidth(compact + char) > maxWidth) break;
      compact += char;
    }
    return compact;
  }

  const ellipsis = "...";
  const target = Math.max(1, maxWidth - displayWidth(ellipsis));
  let truncated = "";
  for (const char of label) {
    if (displayWidth(truncated + char) > target) break;
    truncated += char;
  }
  return `${truncated}${ellipsis}`;
}
