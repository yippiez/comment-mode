export function normalizePosixPath(path: string): string {
  if (!path) return "";
  return path
    .split("/")
    .filter(Boolean)
    .join("/");
}

export function getParentPosixPath(path: string): string {
  const normalized = normalizePosixPath(path);
  if (!normalized) return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}
