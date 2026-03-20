/**
 * POSIX path utilities used across the app (normalization and parent extraction).
 * @param path - The POSIX path to normalize.
 * @returns The normalized path without empty segments or leading/trailing slashes.
 * @example
 * normalizePosixPath("foo//bar/baz")     // "foo/bar/baz"
 * normalizePosixPath("/foo/bar/")         // "foo/bar"
 * normalizePosixPath("")                // ""
 */
export function normalizePosixPath(path: string): string {
    if (!path) { return ""; }
    return path
        .split("/")
        .filter(Boolean)
        .join("/");
}

/**
 * Returns the parent directory of a normalized POSIX path.
 * @param path - The POSIX path whose parent to retrieve.
 * @returns The parent path, or empty string if at root or invalid.
 * @example
 * getParentPosixPath("foo/bar/baz")      // "foo/bar"
 * getParentPosixPath("foo/bar")          // "foo"
 * getParentPosixPath("foo")              // ""
 * getParentPosixPath("")                 // ""
 */
export function getParentPosixPath(path: string): string {
    const parts = normalizePosixPath(path).split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}
