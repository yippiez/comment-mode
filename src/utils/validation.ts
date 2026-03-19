/**
 * Checks if an error represents a "file not found" error (ENOENT).
 * @param error - The error object to check
 * @returns True if the error is an ENOENT error, false otherwise
 * @example
 * const err = new Error("ENOENT: no such file");
 * err.code = "ENOENT";
 * isMissingCodeFileError(err) // true
 * isMissingCodeFileError(new Error("other")) // false
 */
export function isMissingCodeFileError(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Normalizes a list of paths by filtering invalid entries and sorting alphabetically.
 * @param value - Array of path strings to normalize
 * @returns Sorted array of unique, non-empty paths
 * @example
 * normalizePathList(["/b", "/a", "/b"]) // ["/a", "/b"]
 * normalizePathList(["", "/path", 123]) // ["/path"]
 */
export function normalizePathList(value: readonly string[]): string[] {
    return [...new Set(value.filter((entry) => typeof entry === "string" && entry.length > 0))].sort((a, b) =>
        a.localeCompare(b),
    );
}

/**
 * Converts a value to an array of strings, filtering out non-string elements.
 * @param value - The value to convert to a string array
 * @returns Array of strings, or empty array if input is not an array
 * @example
 * toStringArray(["a", "b", 1])      // ["a", "b"]
 * toStringArray("not an array")     // []
 * toStringArray(null)              // []
 */
export function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Converts a value to a non-negative integer, returning 0 for invalid inputs.
 * @param value - The value to convert to a non-negative integer
 * @returns The non-negative integer value (floored and clamped to minimum 0)
 * @example
 * toNonNegativeInteger(5.7)      // 5
 * toNonNegativeInteger(-3)       // 0
 * toNonNegativeInteger("invalid") // 0
 * toNonNegativeInteger(NaN)      // 0
 */
export function toNonNegativeInteger(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
}
