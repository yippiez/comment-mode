import { existsSync, statSync } from "node:fs";
import path from "node:path";
import hljs from "highlight.js/lib/common";
import { listOpencodeModelCatalog, startHeadlessOpencodeRun } from "../../server/src/opencode";
import { isLoopbackAddress } from "../../server/src/security";
import type { CodeFileEntryPayload, OpencodeModelCatalogItem } from "../../server/src/types";
import { getIgnoredDirs, loadCodeFileEntries } from "../../server/src/workspace";

const DEFAULT_PORT = 4173;
const READY_PREFIX = "COMMENT_MODE_PWA_READY ";
const PUBLIC_DIR = path.resolve(import.meta.dir, "..", "public");

type StartupConfig = {
  rootDir: string;
  port: number;
};

type StaticAsset = {
  fileName: string;
  contentType: string;
  cacheControl: string;
};

const STATIC_ASSETS: Record<string, StaticAsset> = {
  "/": {
    fileName: "index.html",
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  },
  "/styles.css": {
    fileName: "styles.css",
    contentType: "text/css; charset=utf-8",
    cacheControl: "no-store",
  },
  "/app.js": {
    fileName: "app.js",
    contentType: "application/javascript; charset=utf-8",
    cacheControl: "no-store",
  },
  "/sw.js": {
    fileName: "sw.js",
    contentType: "application/javascript; charset=utf-8",
    cacheControl: "no-store",
  },
  "/manifest.webmanifest": {
    fileName: "manifest.webmanifest",
    contentType: "application/manifest+json; charset=utf-8",
    cacheControl: "no-store",
  },
  "/icons/icon.svg": {
    fileName: "icons/icon.svg",
    contentType: "image/svg+xml",
    cacheControl: "public, max-age=86400",
  },
};

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

async function main(): Promise<void> {
  const config = parseStartupConfig(process.argv.slice(2));
  if (!config) {
    return;
  }

  const ignoredDirs = await getIgnoredDirs(config.rootDir);

  let server!: Bun.Server;
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: config.port,
    fetch(request) {
      const source = server.requestIP(request);
      if (source && !isLoopbackAddress(source.address)) {
        return jsonError(403, "Only loopback clients are allowed.");
      }

      return handleRequest(request, config, ignoredDirs);
    },
  });

  console.log(
    `${READY_PREFIX}${JSON.stringify({
      url: `http://127.0.0.1:${server.port}`,
      rootDir: config.rootDir,
      localhostOnly: true,
      framework: "htmx",
    })}`,
  );
}

async function handleRequest(
  request: Request,
  startup: StartupConfig,
  ignored: ReadonlySet<string>,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;

  const staticResponse = serveStatic(pathname);
  if (staticResponse) {
    return staticResponse;
  }

  if (pathname === "/api/health") {
    return jsonOk({ ok: true, rootDir: startup.rootDir, localhostOnly: true });
  }

  if (pathname === "/api/dev-hash" && request.method === "GET") {
    return textOk(computeDevHash());
  }

  if (pathname === "/fragments/code-stack" && request.method === "GET") {
    const entries = await loadCodeFileEntries(startup.rootDir, ignored);
    return htmlResponse(renderCodeStack(entries));
  }

  if (pathname === "/fragments/model-options" && request.method === "GET") {
    const catalog = await listOpencodeModelCatalog(startup.rootDir);
    return htmlResponse(renderModelOptions(catalog));
  }

  if (pathname === "/fragments/run" && request.method === "POST") {
    return await handleRunFragment(request, startup, ignored);
  }

  return jsonError(404, "Not found.");
}

function serveStatic(pathname: string): Response | null {
  const asset = STATIC_ASSETS[pathname];
  if (!asset) return null;
  const filePath = path.join(PUBLIC_DIR, asset.fileName);

  return new Response(Bun.file(filePath), {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": asset.cacheControl,
    },
  });
}

async function handleRunFragment(
  request: Request,
  startup: StartupConfig,
  ignored: ReadonlySet<string>,
): Promise<Response> {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return htmlResponse(renderRunResult({ success: false, messages: [], error: "Invalid form payload." }), 400);
  }

  const prompt = getFormValue(formData, "prompt");
  if (!prompt) {
    return htmlResponse(renderRunResult({ success: false, messages: [], error: "Prompt is required." }), 400);
  }

  const entries = await loadCodeFileEntries(startup.rootDir, ignored);
  if (entries.length === 0) {
    return htmlResponse(
      renderRunResult({
        success: false,
        messages: [],
        error: "No code files found in this workspace.",
      }),
      400,
    );
  }

  const preferredPath = getFormValue(formData, "filePath");
  const selectedEntry = entries.find((entry) => entry.relativePath === preferredPath) ?? entries[0];
  if (!selectedEntry) {
    return htmlResponse(renderRunResult({ success: false, messages: [], error: "Unable to resolve a file." }), 400);
  }

  const modelCatalog = await listOpencodeModelCatalog(startup.rootDir);
  const requestedModel = getFormValue(formData, "model");
  const defaultModel = modelCatalog[0]?.model;
  const model = requestedModel ?? defaultModel;
  if (!model) {
    return htmlResponse(
      renderRunResult({
        success: false,
        messages: [],
        error: "No model available. Confirm the opencode CLI has a configured model.",
      }),
      400,
    );
  }

  const startLineRaw = parsePositiveInt(getFormValue(formData, "selectionStartFileLine"));
  const endLineRaw = parsePositiveInt(getFormValue(formData, "selectionEndFileLine"));
  const selectionStartFileLine = clamp(startLineRaw ?? 1, 1, selectedEntry.lineCount);
  const selectionEndFileLine = clamp(
    endLineRaw ?? selectedEntry.lineCount,
    selectionStartFileLine,
    selectedEntry.lineCount,
  );
  const selectedText = pickSelectedText(selectedEntry.content, selectionStartFileLine, selectionEndFileLine);

  const runMessages: string[] = [];
  let resolveRun!: (value: { success: boolean; error?: string }) => void;
  const runFinished = new Promise<{ success: boolean; error?: string }>((resolve) => {
    resolveRun = resolve;
  });

  const runResult = await startHeadlessOpencodeRun({
    rootDir: startup.rootDir,
    runId: createRunId(selectedEntry.relativePath),
    model,
    variant: undefined,
    contextMode: "code",
    filePath: selectedEntry.relativePath,
    selectionStartFileLine,
    selectionEndFileLine,
    prompt,
    selectedText,
    onMessage: (messageText) => {
      const trimmed = messageText.trim();
      if (!trimmed) return;
      runMessages.push(trimmed);
    },
    onExit: (result) => {
      resolveRun(result);
    },
  });

  if (!runResult.ok) {
    return htmlResponse(
      renderRunResult({
        success: false,
        messages: dedupeMessages(runMessages),
        error: runResult.error,
      }),
      500,
    );
  }

  const outcome = await runFinished;
  return htmlResponse(
    renderRunResult({
      success: outcome.success,
      error: outcome.error,
      messages: dedupeMessages(runMessages),
      filePath: selectedEntry.relativePath,
      model,
    }),
    outcome.success ? 200 : 500,
  );
}

function renderCodeStack(entries: readonly CodeFileEntryPayload[]): string {
  if (entries.length === 0) {
    return '<p class="empty-state">No code files were found in this workspace.</p>';
  }

  return entries
    .map((entry) => {
      const filePath = escapeHtml(entry.relativePath);
      const filePathAttr = escapeHtmlAttribute(entry.relativePath);
      const language = detectHighlightLanguage(entry.relativePath);
      const code = renderCodeLines(entry.content.length > 0 ? entry.content : "\n", language);
      const languageClass = `hljs language-${escapeHtmlAttribute(language)}`;
      const fileTypeLabel = entry.typeLabel.trim();
      const fileTypeKey = escapeHtmlAttribute(fileTypeLabel.toLowerCase());
      const fileTypeDisplay = escapeHtml(fileTypeLabel);

      return [
        `<section class="file-block" data-file-block data-file-type-key="${fileTypeKey}" data-file-type-label="${fileTypeDisplay}">`,
        `  <button type="button" class="file-divider" data-divider data-path="${filePathAttr}" data-type-key="${fileTypeKey}" data-start="1" data-end="${entry.lineCount.toString()}" aria-expanded="true"><span class="divider-path">/// ${filePath}</span><span class="divider-type">${fileTypeDisplay}</span></button>`,
        `  <pre class="code-block"><code class="${languageClass}">`,
        code,
        "  </code></pre>",
        "</section>",
      ].join("\n");
    })
    .join("\n");
}

function detectHighlightLanguage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "typescript";
    case ".js":
    case ".cjs":
    case ".mjs":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".json":
      return "json";
    case ".css":
      return "css";
    case ".scss":
      return "scss";
    case ".html":
    case ".htm":
      return "xml";
    case ".md":
      return "markdown";
    case ".yml":
    case ".yaml":
      return "yaml";
    case ".sh":
      return "bash";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".py":
      return "python";
    case ".java":
      return "java";
    case ".swift":
      return "swift";
    case ".toml":
      return "ini";
    case ".xml":
      return "xml";
    default:
      return "plaintext";
  }
}

function renderCodeLines(content: string, language: string): string {
  const lines = content.split("\n");
  return lines
    .map((line, index) => {
      const highlighted = highlightLine(line, language);
      const value = highlighted.length > 0 ? highlighted : "&nbsp;";
      return `<span class="code-line"><span class="line-number">${(index + 1).toString()}</span><span class="line-content">${value}</span></span>`;
    })
    .join("\n");
}

function highlightLine(line: string, language: string): string {
  if (line.length === 0) {
    return "";
  }

  if (language === "plaintext") {
    return escapeHtml(line);
  }

  try {
    return hljs.highlight(line, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(line);
  }
}

function computeDevHash(): string {
  const paths = [
    path.resolve(import.meta.dir, "index.ts"),
    ...Object.values(STATIC_ASSETS).map((asset) => path.join(PUBLIC_DIR, asset.fileName)),
  ];

  const statBits: string[] = [];
  for (const filePath of paths) {
    if (!existsSync(filePath)) {
      statBits.push(`${filePath}:missing`);
      continue;
    }

    const stat = statSync(filePath);
    statBits.push(`${filePath}:${Math.floor(stat.mtimeMs).toString()}:${stat.size.toString()}`);
  }

  return Bun.hash(statBits.join("|"))
    .toString(16)
    .padStart(16, "0");
}

function renderModelOptions(catalog: readonly OpencodeModelCatalogItem[]): string {
  if (catalog.length === 0) {
    return '<option value="" selected>No models found</option>';
  }

  return catalog
    .map((item, index) => {
      const variants = item.variants.length > 0 ? ` (${item.variants.join(", ")})` : "";
      const selected = index === 0 ? " selected" : "";
      return `<option value="${escapeHtmlAttribute(item.model)}"${selected}>${escapeHtml(item.model + variants)}</option>`;
    })
    .join("\n");
}

function renderRunResult(result: {
  success: boolean;
  messages: readonly string[];
  error?: string;
  filePath?: string;
  model?: string;
}): string {
  const runState = result.success ? "done" : "failed";
  const detail = result.error ?? result.messages[result.messages.length - 1] ?? "";

  return `<div data-run-state="${runState}" data-run-detail="${escapeHtmlAttribute(detail)}"></div>`;
}

function getFormValue(formData: { get: (name: string) => unknown }, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pickSelectedText(content: string, startLine: number, endLine: number): string {
  const lines = content.split("\n");
  const from = Math.max(startLine - 1, 0);
  const to = Math.max(endLine, from + 1);
  return lines.slice(from, to).join("\n");
}

function createRunId(filePath: string): string {
  const stem = path
    .basename(filePath)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `pwa-${stem || "task"}-${Date.now().toString(36)}`;
}

function dedupeMessages(messages: readonly string[]): string[] {
  const deduped: string[] = [];
  for (const message of messages) {
    const trimmed = message.trim();
    if (!trimmed) continue;
    if (deduped[deduped.length - 1] === trimmed) continue;
    deduped.push(trimmed);
  }
  return deduped;
}

function parseStartupConfig(argv: string[]): StartupConfig | null {
  let rootFromArg: string | undefined;
  let portFromArg: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    if (token === "--help" || token === "-h") {
      printHelp();
      return null;
    }

    if (token === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a value.");
      }
      rootFromArg = value;
      index += 1;
      continue;
    }

    if (token === "--port") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--port requires a value.");
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error("--port must be an integer between 0 and 65535.");
      }
      portFromArg = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  const rootDir = path.resolve(rootFromArg ?? process.cwd());
  if (!existsSync(rootDir)) {
    throw new Error(`Workspace root does not exist: ${rootDir}`);
  }

  return {
    rootDir,
    port: portFromArg ?? DEFAULT_PORT,
  };
}

function printHelp(): void {
  console.log("comment-mode pwa");
  console.log("");
  console.log("Options:");
  console.log("  --root <path>      Workspace root (default current directory)");
  console.log(`  --port <number>    Bind port (default ${DEFAULT_PORT.toString()})`);
  console.log("  --help             Show this help");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function htmlResponse(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function textOk(content: string): Response {
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
