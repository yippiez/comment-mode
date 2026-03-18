
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toNonEmptyTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function toSignedUnit(value: unknown): -1 | 1 | null {
  if (value === -1 || value === 1) {
    return value;
  }
  return null;
}

export function toPromptFieldDelta(value: unknown): -2 | -1 | 1 | null {
  if (value === -2 || value === -1 || value === 1) {
    return value;
  }
  return null;
}
