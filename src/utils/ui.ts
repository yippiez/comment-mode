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
