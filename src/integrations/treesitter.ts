import { addDefaultParsers, type FiletypeParserOptions } from "@opentui/core";

const CUSTOM_TREE_SITTER_PARSERS: FiletypeParserOptions[] = [
    {
        filetype: "html",
        wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-html.wasm",
        queries: {
            highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-html/master/queries/highlights.scm"],
            injections: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-html/master/queries/injections.scm"],
        },
    },
    {
        filetype: "css",
        wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-css.wasm",
        queries: {
            highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-css/master/queries/highlights.scm"],
        },
    },
    {
        filetype: "tcss",
        wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-css.wasm",
        queries: {
            highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-css/master/queries/highlights.scm"],
        },
    },
    {
        filetype: "json",
        wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-json.wasm",
        queries: {
            highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-json/master/queries/highlights.scm"],
        },
    },
    {
        filetype: "python",
        wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-python.wasm",
        queries: {
            highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/master/queries/highlights.scm"],
        },
    },
    {
        filetype: "rust",
        wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-rust.wasm",
        queries: {
            highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-rust/master/queries/highlights.scm"],
            injections: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-rust/master/queries/injections.scm"],
        },
    },
    {
        filetype: "svelte",
        wasm: "https://unpkg.com/tree-sitter-svelte/tree-sitter-svelte.wasm",
        queries: {
            highlights: ["https://raw.githubusercontent.com/Himujjal/tree-sitter-svelte/master/queries/highlights.scm"],
            injections: ["https://raw.githubusercontent.com/Himujjal/tree-sitter-svelte/master/queries/injections.scm"],
        },
    },
];

let registeredCustomParsers = false;

export function registerTreeSitterParsers(): void {
    if (registeredCustomParsers) return;
    addDefaultParsers(CUSTOM_TREE_SITTER_PARSERS);
    registeredCustomParsers = true;
}
