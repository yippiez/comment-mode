/**
 * Parses a value as a date and returns an ISO timestamp string.
 * @param value - The value to parse as a date
 * @param fallback - The fallback string to return if parsing fails
 * @returns ISO formatted date string, or fallback if invalid
 * @example
 * toIsoTimestamp("2024-01-15T10:30:00Z", "invalid") // "2024-01-15T10:30:00.000Z"
 * toIsoTimestamp("not a date", "invalid")            // "invalid"
 * toIsoTimestamp(123, "invalid")                     // "invalid"
 */
export function toIsoTimestamp(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return fallback;
    return new Date(parsed).toISOString();
}
