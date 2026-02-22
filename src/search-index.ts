import type { CodeFileEntry } from "./types";

export type SearchResultKind =
  | "file"
  | "function"
  | "class"
  | "variable"
  | "type"
  | "heading";

export type SearchResult = {
  id: string;
  name: string;
  kind: SearchResultKind;
  filePath: string;
  fileLine: number;
  sortText: string;
};

const MAX_SYMBOLS_PER_FILE = 600;

export function buildSearchIndex(entries: readonly CodeFileEntry[]): SearchResult[] {
  const results: SearchResult[] = [];

  for (const entry of entries) {
    results.push({
      id: `file:${entry.relativePath}`,
      name: entry.relativePath,
      kind: "file",
      filePath: entry.relativePath,
      fileLine: 1,
      sortText: entry.relativePath.toLowerCase(),
    });

    const symbolResults = extractSymbols(entry);
    for (const symbol of symbolResults) {
      results.push(symbol);
    }
  }

  return results;
}

export function querySearchIndex(
  index: readonly SearchResult[],
  query: string,
  limit: number,
): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return index
      .slice()
      .sort((a, b) => compareKindPriority(a.kind, b.kind) || a.sortText.localeCompare(b.sortText))
      .slice(0, limit);
  }

  const withScore = index
    .map((result) => ({
      result,
      score: scoreResult(result, normalizedQuery),
    }))
    .filter((entry) => entry.score < Number.POSITIVE_INFINITY)
    .sort((a, b) => a.score - b.score || a.result.sortText.localeCompare(b.result.sortText));

  return withScore.slice(0, limit).map((entry) => entry.result);
}

function extractSymbols(entry: CodeFileEntry): SearchResult[] {
  const results: SearchResult[] = [];
  const lines = entry.content.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (results.length >= MAX_SYMBOLS_PER_FILE) break;
    const line = lines[lineIndex] ?? "";
    const fileLine = lineIndex + 1;

    const heading = /^(\s{0,3}#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const title = heading[2]?.trim();
      if (title) {
        results.push(makeSymbol(entry.relativePath, title, "heading", fileLine));
        continue;
      }
    }

    const jsFunction =
      /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line) ??
      /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.exec(
        line,
      ) ??
      /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/.exec(
        line,
      ) ??
      /^\s*def\s+([A-Za-z_][\w]*)\s*\(/.exec(line) ??
      /^\s*func\s+([A-Za-z_][\w]*)\s*\(/.exec(line) ??
      /^\s*fn\s+([A-Za-z_][\w]*)\s*\(/.exec(line);
    if (jsFunction?.[1]) {
      results.push(makeSymbol(entry.relativePath, jsFunction[1], "function", fileLine));
      continue;
    }

    const methodMatch =
      /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\s*\{/.exec(
        line,
      ) ??
      /^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*:\s*[A-Za-z_$][\w$<>, \[\]\|]*\s*\{/.exec(line);
    if (methodMatch?.[1] && !isKeywordLike(methodMatch[1])) {
      results.push(makeSymbol(entry.relativePath, methodMatch[1], "function", fileLine));
      continue;
    }

    const classMatch =
      /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b/.exec(line) ??
      /^\s*class\s+([A-Za-z_][\w]*)\b/.exec(line);
    if (classMatch?.[1]) {
      results.push(makeSymbol(entry.relativePath, classMatch[1], "class", fileLine));
      continue;
    }

    const typeMatch =
      /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)\b/.exec(line) ??
      /^\s*type\s+([A-Za-z_][\w]*)\s*=/.exec(line) ??
      /^\s*(?:struct|trait|enum)\s+([A-Za-z_][\w]*)\b/.exec(line);
    if (typeMatch?.[1]) {
      results.push(makeSymbol(entry.relativePath, typeMatch[1], "type", fileLine));
      continue;
    }

    const variableMatch =
      /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line) ??
      /^\s*([A-Za-z_][\w]*)\s*=/.exec(line);
    if (variableMatch?.[1]) {
      results.push(makeSymbol(entry.relativePath, variableMatch[1], "variable", fileLine));
    }
  }

  return dedupeSymbols(results);
}

function makeSymbol(
  filePath: string,
  name: string,
  kind: SearchResultKind,
  fileLine: number,
): SearchResult {
  const id = `${kind}:${filePath}:${name}:${String(fileLine)}`;
  const sortText = `${name.toLowerCase()} ${filePath.toLowerCase()}`;
  return {
    id,
    name,
    kind,
    filePath,
    fileLine,
    sortText,
  };
}

function dedupeSymbols(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const result of results) {
    const key = `${result.kind}:${result.filePath}:${result.name}:${String(result.fileLine)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

function scoreResult(result: SearchResult, query: string): number {
  const filePath = result.filePath.toLowerCase();
  const name = result.name.toLowerCase();

  if (result.kind === "file") {
    const exact = filePath === query ? 0 : Number.POSITIVE_INFINITY;
    if (exact === 0) return exact;
    const starts = filePath.startsWith(query) ? 6 : Number.POSITIVE_INFINITY;
    if (starts !== Number.POSITIVE_INFINITY) return starts;
    const includes = filePath.includes(query) ? 16 : Number.POSITIVE_INFINITY;
    if (includes !== Number.POSITIVE_INFINITY) return includes;
    return Number.POSITIVE_INFINITY;
  }

  if (name === query) return 1;
  if (name.startsWith(query)) return 4;
  if (name.includes(query)) return 10;
  if (filePath.includes(query)) return 24;
  return Number.POSITIVE_INFINITY;
}

function compareKindPriority(a: SearchResultKind, b: SearchResultKind): number {
  const order: SearchResultKind[] = ["file", "function", "class", "type", "variable", "heading"];
  return order.indexOf(a) - order.indexOf(b);
}

function isKeywordLike(value: string): boolean {
  const keywords = new Set(["if", "for", "while", "switch", "catch", "return", "new"]);
  return keywords.has(value);
}
