/**
 * Selection/string utilities: build stable prompt paths from cursor selection metadata.
 * @param paths - Array of paths to check for uniqueness
 * @returns The unique path if all paths are the same, null otherwise
 * @example
 * resolveSinglePath(["a.txt", "a.txt"])     // "a.txt"
 * resolveSinglePath(["a.txt", "b.txt"])    // null
 * resolveSinglePath([])                     // null
 */
export function resolveSinglePath(paths: readonly string[]): string | null {
    const unique = new Set(paths);
    if (unique.size !== 1) return null;
    const [first] = unique;
    return first ?? null;
}

/**
 * Removes duplicate strings while preserving the original order of first occurrences.
 * @param values - Array of strings to deduplicate
 * @returns Array with duplicates removed, preserving first-occurrence order
 * @example
 * dedupePreserveOrder(["a", "b", "a", "c"]) // ["a", "b", "c"]
 * dedupePreserveOrder(["x", "x"])           // ["x"]
 */
export function dedupePreserveOrder(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
        if (seen.has(value)) continue;
        seen.add(value);
        output.push(value);
    }
    return output;
}

/**
 * Returns the path value if non-empty, otherwise returns the fallback.
 * @param pathValue - The primary path string to check
 * @param fallback - The fallback path string to return if pathValue is empty
 * @returns The pathValue if non-empty, otherwise the fallback
 * @example
 * normalizeSelectionPath("myfile.txt", "default.txt") // "myfile.txt"
 * normalizeSelectionPath("", "default.txt")          // "default.txt"
 * normalizeSelectionPath("   ", "default.txt")      // "default.txt"
 */
export function normalizeSelectionPath(pathValue: string, fallback: string): string {
    return pathValue.length > 0 ? pathValue : fallback;
}
