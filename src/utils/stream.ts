export function consumeLines(buffer: string, chunk: string, onLine: (line: string) => void): string {
  const full = buffer + chunk;
  const parts = full.split(/\r?\n/);
  const tail = parts.pop() ?? "";
  for (const line of parts) {
    onLine(line);
  }
  return tail;
}
