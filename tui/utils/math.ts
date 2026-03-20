/**
 * Math helpers used by the TUI (clamping and index wrapping).
 * @param value - The number to clamp
 * @param min - The minimum bound (inclusive)
 * @param max - The maximum bound (inclusive)
 * @returns The clamped value, constrained to [min, max]
 * @example
 * clamp(5, 0, 10)   // 5
 * clamp(-1, 0, 10)  // 0
 * clamp(15, 0, 10) // 10
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Wraps an index to be within valid bounds using modulo arithmetic.
 * Handles negative indices by normalizing them first.
 * @param index - The index to wrap (can be negative)
 * @param length - The length of the container (must be positive)
 * @returns The wrapped index in the range [0, length)
 * @example
 * wrapIndex(5, 3)    // 2 (wraps around)
 * wrapIndex(-1, 4)   // 3 (negative wraps to end)
 * wrapIndex(0, 5)    // 0
 * wrapIndex(10, 5)   // 0
 */
export function wrapIndex(index: number, length: number): number {
    if (!Number.isFinite(length) || length <= 0) { return 0; }
    const size = Math.floor(length);
    const normalized = Math.floor(index);
    return ((normalized % size) + size) % size;
}
