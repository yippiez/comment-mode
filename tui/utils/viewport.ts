/**
 * Viewport/layout width calculations for the TUI.
 * @param viewportWidth - Measured viewport width from layout, if available
 * @param scrollboxWidth - Fallback width from the scroll container
 * @param rendererWidth - Final fallback width from the renderer
 * @returns A positive integer viewport width
 * @example
 * resolveViewportWidth(120, 100, 80) // 120
 * resolveViewportWidth(0, 100, 80) // 100
 * resolveViewportWidth(0, 0, 80) // 80
 */
export function resolveViewportWidth(viewportWidth: number, scrollboxWidth: number, rendererWidth: number): number {
    if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
        return Math.floor(viewportWidth);
    }
    if (Number.isFinite(scrollboxWidth) && scrollboxWidth > 0) {
        return Math.floor(scrollboxWidth);
    }
    return Math.max(1, Math.floor(rendererWidth));
}

/**
 * Computes available width for files mode while reserving one column.
 * @param viewportWidth - Measured viewport width from layout
 * @param scrollboxWidth - Fallback width from the scroll container
 * @param rendererWidth - Final fallback width from the renderer
 * @returns Files-mode width clamped to at least 1
 * @example
 * computeFilesModeViewportWidth(80, 0, 0) // 79
 * computeFilesModeViewportWidth(1, 0, 0) // 1
 */
export function computeFilesModeViewportWidth(
    viewportWidth: number,
    scrollboxWidth: number,
    rendererWidth: number,
): number {
    const resolved = resolveViewportWidth(viewportWidth, scrollboxWidth, rendererWidth);
    return Math.max(1, resolved - 1);
}

/**
 * Computes agent content width after subtracting horizontal padding.
 * @param viewportWidth - Measured viewport width from layout
 * @param scrollboxWidth - Fallback width from the scroll container
 * @param rendererWidth - Final fallback width from the renderer
 * @param paddingLeft - Left padding applied to the content area
 * @param paddingRight - Right padding applied to the content area
 * @returns Content width clamped to a minimum of 8 columns
 * @example
 * computeAgentContentWidth(100, 0, 0, 2, 2) // 96
 * computeAgentContentWidth(10, 0, 0, 4, 4) // 8
 */
export function computeAgentContentWidth(
    viewportWidth: number,
    scrollboxWidth: number,
    rendererWidth: number,
    paddingLeft: number,
    paddingRight: number,
): number {
    const resolved = resolveViewportWidth(viewportWidth, scrollboxWidth, rendererWidth);
    return Math.max(8, resolved - Math.max(0, paddingLeft) - Math.max(0, paddingRight));
}
