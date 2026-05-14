#!/usr/bin/env bun
/**
 * TUI entrypoint for the agentic code review workflow.
 * Creates the OpenTUI renderer and starts the Review Diff Feed app.
 */
import { createCliRenderer } from "@opentui/core";
import { ReviewTuiApp } from "./app2/review_tui_app";

/**
 * Starts the comment-mode TUI in the current working directory.
 * @param rootDir - Workspace root to review
 */
export async function startTui(rootDir: string = process.cwd()): Promise<void> {
    const renderer = await createCliRenderer({ exitOnCtrlC: true });
    const app = new ReviewTuiApp(renderer, rootDir);
    renderer.on("destroy", () => {
        app.shutdown();
    });
    await app.start();
}

if (import.meta.main) {
    startTui().catch((error: unknown) => {
        console.error(error);
    });
}
