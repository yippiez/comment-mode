import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";

const VIEWS_DIR = path.resolve(import.meta.dir, "views");
const VIEW_FILES = ["AppShell.svelte", "CodeStack.svelte", "ModelOptions.svelte", "RunResult.svelte"] as const;

type RenderableComponent = unknown;

type CompiledView = {
  mtimeMs: number;
  component: RenderableComponent;
};

const viewCache = new Map<string, CompiledView>();

export const SVELTE_VIEW_PATHS = VIEW_FILES.map((fileName) => path.join(VIEWS_DIR, fileName));

export type CodeStackRenderableEntry = {
  path: string;
  fileTypeKey: string;
  fileTypeLabel: string;
  lineCount: number;
  language: string;
  codeHtml: string;
};

export type ModelOptionRenderable = {
  model: string;
  label: string;
};

export type RunResultRenderable = {
  success: boolean;
  messages: readonly string[];
  error?: string;
};

export async function renderAppShellDocument(): Promise<string> {
  const body = await renderView("AppShell.svelte", {});
  return `<!doctype html>\n${body}`;
}

export async function renderCodeStackFragment(entries: readonly CodeStackRenderableEntry[]): Promise<string> {
  return renderView("CodeStack.svelte", { entries });
}

export async function renderModelOptionsFragment(catalog: readonly ModelOptionRenderable[]): Promise<string> {
  return renderView("ModelOptions.svelte", { catalog });
}

export async function renderRunResultFragment(result: RunResultRenderable): Promise<string> {
  return renderView("RunResult.svelte", { result });
}

async function renderView(fileName: (typeof VIEW_FILES)[number], props: Record<string, unknown>): Promise<string> {
  const component = await loadView(fileName);
  const serverRender = render as (component: unknown, options: { props: Record<string, unknown> }) => { body: string };
  return stripSvelteMarkers(serverRender(component, { props }).body);
}

function stripSvelteMarkers(html: string): string {
  return html
    .replaceAll("<!--[!-->", "")
    .replaceAll("<!--[-->", "")
    .replaceAll("<!--]-->", "");
}

async function loadView(fileName: (typeof VIEW_FILES)[number]): Promise<RenderableComponent> {
  const filePath = path.join(VIEWS_DIR, fileName);
  const stat = statSync(filePath);
  const cached = viewCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.component;
  }

  const source = readFileSync(filePath, "utf8");
  const compiled = compile(source, {
    filename: filePath,
    generate: "server",
    dev: false,
    fragments: "html",
  });

  const moduleCode = `${compiled.js.code}\n//# sourceURL=${filePath}?v=${stat.mtimeMs.toString()}`;
  const encoded = Buffer.from(moduleCode).toString("base64");
  const moduleUrl = `data:text/javascript;base64,${encoded}`;
  const module = (await import(moduleUrl)) as { default: RenderableComponent };

  const entry = {
    mtimeMs: stat.mtimeMs,
    component: module.default,
  } satisfies CompiledView;

  viewCache.set(filePath, entry);
  return entry.component;
}
