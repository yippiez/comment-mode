export function displayWidth(text: string): number {
  try {
    return Bun.stringWidth(text);
  } catch {
    return text.length;
  }
}

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

export function estimateWrappedLines(text: string, width: number): number {
  if (width <= 1) return 1;
  const normalized = text.replace(/\t/g, "  ");
  const lines = normalized.length === 0 ? [""] : normalized.split("\n");
  let total = 0;
  for (const line of lines) {
    const segmentLength = Math.max(1, displayWidth(line));
    total += Math.max(1, Math.ceil(segmentLength / width));
  }
  return Math.max(1, total);
}

export function countLogicalLines(content: string): number {
  if (content.length === 0) return 1;
  return content.split("\n").length;
}

export function normalizePersistedLineText(value: string | null): string | null {
  if (typeof value !== "string") return null;
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}
