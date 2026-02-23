import type { CodeFileEntry } from "./types";

export type SearchResultKind =
  | "file"
  | "function"
  | "class"
  | "variable"
  | "type"
  | "heading"
  | "reference";

export type SearchResult = {
  id: string;
  name: string;
  kind: SearchResultKind;
  filePath: string;
  fileLine: number;
  sortText: string;
};

const MAX_SYMBOLS_PER_FILE = 600;
const MAX_REFERENCES_PER_FILE = 600;

export function buildSearchIndex(entries: readonly CodeFileEntry[]): SearchResult[] {
  const results: SearchResult[] = [];
  const symbolResults: SearchResult[] = [];

  for (const entry of entries) {
    results.push({
      id: `file:${entry.relativePath}`,
      name: entry.relativePath,
      kind: "file",
      filePath: entry.relativePath,
      fileLine: 1,
      sortText: entry.relativePath.toLowerCase(),
    });

    const symbols = extractSymbols(entry);
    for (const symbol of symbols) {
      symbolResults.push(symbol);
      results.push(symbol);
    }
  }

  const references = extractReferences(entries, symbolResults);
  for (const reference of references) {
    results.push(reference);
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
    const files: SearchResult[] = [];
    const symbols: SearchResult[] = [];
    for (const result of index) {
      if (result.kind === "file") {
        files.push(result);
      } else if (result.kind !== "reference") {
        symbols.push(result);
      }
    }
    files.sort((a, b) => a.sortText.localeCompare(b.sortText));
    symbols.sort((a, b) => compareKindPriority(a.kind, b.kind) || a.sortText.localeCompare(b.sortText));
    return [...files, ...symbols].slice(0, limit);
  }

  const files: Array<{ result: SearchResult; score: number }> = [];
  const symbols: Array<{ result: SearchResult; score: number }> = [];
  const references: Array<{ result: SearchResult; score: number }> = [];

  for (const result of index) {
    const score = scoreResult(result, normalizedQuery);
    if (!Number.isFinite(score)) continue;

    if (result.kind === "file") {
      files.push({ result, score });
      continue;
    }
    if (result.kind === "reference") {
      references.push({ result, score });
      continue;
    }
    symbols.push({ result, score });
  }

  files.sort((a, b) => a.score - b.score || a.result.sortText.localeCompare(b.result.sortText));
  symbols.sort((a, b) => a.score - b.score || a.result.sortText.localeCompare(b.result.sortText));
  references.sort((a, b) => a.score - b.score || a.result.sortText.localeCompare(b.result.sortText));
  const symbolNamePool = new Set(symbols.map((entry) => entry.result.name.toLowerCase()));
  const filteredReferences = references.filter(
    (entry) => !symbolNamePool.has(entry.result.name.toLowerCase()),
  );

  const primary = [...files, ...symbols];
  if (filteredReferences.length === 0) {
    return primary.slice(0, limit).map((entry) => entry.result);
  }

  const shouldPrioritizeReferences = /^[A-Za-z_$][\w$]*$/.test(normalizedQuery);
  if (!shouldPrioritizeReferences) {
    return [...primary, ...filteredReferences].slice(0, limit).map((entry) => entry.result);
  }

  const reservedReferenceSlots = Math.min(4, limit, filteredReferences.length);
  const primaryLimit = Math.max(0, limit - reservedReferenceSlots);
  const selectedPrimary = primary.slice(0, primaryLimit);
  const selectedReferences = filteredReferences.slice(0, limit - selectedPrimary.length);
  const remainingSlots = limit - selectedPrimary.length - selectedReferences.length;
  const extraPrimary = remainingSlots > 0 ? primary.slice(primaryLimit, primaryLimit + remainingSlots) : [];

  return [...selectedPrimary, ...selectedReferences, ...extraPrimary].map((entry) => entry.result);
}

function extractReferences(
  entries: readonly CodeFileEntry[],
  symbols: readonly SearchResult[],
): SearchResult[] {
  const referenceableNames = new Set<string>();
  const definitionLines = new Set<string>();

  for (const symbol of symbols) {
    if (symbol.kind === "heading") continue;
    if (symbol.kind === "reference") continue;
    if (symbol.kind === "file") continue;
    referenceableNames.add(symbol.name);
    definitionLines.add(`${symbol.filePath}:${String(symbol.fileLine)}:${symbol.name.toLowerCase()}`);
  }

  if (referenceableNames.size === 0) {
    return [];
  }

  const normalizedReferenceNames = new Set<string>();
  for (const name of referenceableNames) {
    normalizedReferenceNames.add(name.toLowerCase());
  }

  const references: SearchResult[] = [];
  for (const entry of entries) {
    const lines = entry.content.split("\n");
    let fileReferenceCount = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (fileReferenceCount >= MAX_REFERENCES_PER_FILE) break;

      const line = lines[lineIndex] ?? "";
      const fileLine = lineIndex + 1;
      const identifiers = extractIdentifiers(line);
      if (identifiers.length === 0) continue;

      const seenOnLine = new Set<string>();
      for (const identifier of identifiers) {
        const normalizedIdentifier = identifier.toLowerCase();
        if (!normalizedReferenceNames.has(normalizedIdentifier)) continue;
        if (seenOnLine.has(normalizedIdentifier)) continue;
        seenOnLine.add(normalizedIdentifier);

        const definitionKey = `${entry.relativePath}:${String(fileLine)}:${normalizedIdentifier}`;
        if (definitionLines.has(definitionKey)) continue;

        references.push(makeSymbol(entry.relativePath, identifier, "reference", fileLine));
        fileReferenceCount += 1;
        if (fileReferenceCount >= MAX_REFERENCES_PER_FILE) break;
      }
    }
  }

  return dedupeSymbols(references);
}

function extractIdentifiers(line: string): string[] {
  const matches = line.match(/[A-Za-z_$][\w$]*/g);
  if (!matches) return [];
  return matches;
}

function scoreResult(result: SearchResult, query: string): number {
  const filePath = result.filePath.toLowerCase();
  const name = result.name.toLowerCase();

  if (result.kind === "file") {
    if (filePath === query) return -200;
    return fuzzySubsequenceScore(filePath, query);
  }

  if (result.kind === "reference") {
    if (name === query) return -120;
    const referenceScore = fuzzySubsequenceScore(name, query);
    if (!Number.isFinite(referenceScore)) return Number.POSITIVE_INFINITY;
    return referenceScore + 60;
  }

  if (name === query) return -180;
  const nameScore = fuzzySubsequenceScore(name, query);
  const pathScore = fuzzySubsequenceScore(filePath, query);
  const best = Math.min(nameScore, pathScore + 45);
  if (!Number.isFinite(best)) return Number.POSITIVE_INFINITY;
  return best + 20;
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

function fuzzySubsequenceScore(candidate: string, query: string): number {
  if (query.length === 0) return 0;
  let queryIndex = 0;
  let score = 0;
  let lastMatch = -1;
  let startIndex = -1;

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== query[queryIndex]) continue;

    if (startIndex < 0) {
      startIndex = index;
      score += index * 2;
    }
    score += index;
    if (index === 0 || "/._-:#".includes(candidate[index - 1] ?? "")) {
      score -= 10;
    }
    if (lastMatch === index - 1) {
      score -= 6;
    }
    lastMatch = index;
    queryIndex += 1;

    if (queryIndex === query.length) {
      score += candidate.length - query.length;
      return score;
    }
  }

  return Number.POSITIVE_INFINITY;
}

function compareKindPriority(a: SearchResultKind, b: SearchResultKind): number {
  const order: SearchResultKind[] = [
    "file",
    "function",
    "class",
    "type",
    "variable",
    "heading",
    "reference",
  ];
  return order.indexOf(a) - order.indexOf(b);
}

function isKeywordLike(value: string): boolean {
  const keywords = new Set(["if", "for", "while", "switch", "catch", "return", "new"]);
  return keywords.has(value);
}
