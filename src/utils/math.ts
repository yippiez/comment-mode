export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function wrapIndex(index: number, length: number): number {
    if (!Number.isFinite(length) || length <= 0) return 0;
    const size = Math.floor(length);
    const normalized = Math.floor(index);
    return ((normalized % size) + size) % size;
}
