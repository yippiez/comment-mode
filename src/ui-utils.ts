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

export function clearChildren(container: {
  getChildren: () => { id: string }[];
  remove: (id: string) => void;
}): void {
  for (const child of container.getChildren()) {
    container.remove(child.id);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
