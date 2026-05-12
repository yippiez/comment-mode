#!/usr/bin/env bun
/**
 * CLI interface for comment-mode: provides diff, staging, and status
 * commands without launching the full TUI.
 *
 * Usage:
 *   comment help                    Show help
 *   comment diff                    Show unified diff of changed files
 *   comment diff --name-only        List changed file paths only
 *   comment diff --stat             Show diff stats (added/removed)
 *   comment diff --staged           Show staged changes only
 *   comment files                   List changed files with staging info
 *   comment git stage <file>        Stage a file
 *   comment git unstage <file>      Unstage a file
 *   comment git status              Show git porcelain status
 *   comment jj status               Show jj workspace status
 *   comment jj diff                 Show jj diff of current change
 *   comment jj log                  Show recent jj commits
 *   comment agent models            List available models from all harnesses
 *   comment vcs                     Detect which VCS is in use
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    detectVcsType,
    collectDiffInfo,
    getChangedFiles,
    type ChangedFile,
} from "./tui/integrations/version_control/interface";
import { diffLines, getDiffStats } from "./tui/utils/diff";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const R = "\x1b[0m";        // reset
const B = "\x1b[1m";        // bold
const G = "\x1b[32m";       // green (additions)
const r = "\x1b[31m";       // red (deletions)
const Y = "\x1b[33m";       // yellow (filename)
const D = "\x1b[2m";        // dim
const C = "\x1b[36m";       // cyan (info)

function dim(text: string): string { return `${D}${text}${R}`; }
function green(text: string): string { return `${G}${text}${R}`; }
function red(text: string): string { return `${r}${text}${R}`; }
function yellow(text: string): string { return `${Y}${text}${R}`; }
function cyan(text: string): string { return `${C}${text}${R}`; }
function bold(text: string): string { return `${B}${text}${R}`; }

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
    console.log(bold("comment") + " — code review CLI");
    console.log();
    console.log("Usage:  " + cyan("comment <command> [options]"));
    console.log();
    console.log(bold("Diff & Files:"));
    console.log("  " + cyan("diff") + "                    Show unified diff of changed files");
    console.log("  " + cyan("diff --name-only") + "       List changed file paths only");
    console.log("  " + cyan("diff --stat") + "            Show diff stats (lines added/removed)");
    console.log("  " + cyan("diff --staged") + "          Show staged changes only (git)");
    console.log("  " + cyan("files") + "                  List changed files with status");
    console.log();
    console.log(bold("Git:"));
    console.log("  " + cyan("git stage <file>") + "       Stage a file (equivalent to git add)");
    console.log("  " + cyan("git unstage <file>") + "     Unstage a file (equivalent to git reset)");
    console.log("  " + cyan("git status") + "             Show git porcelain status");
    console.log();
    console.log(bold("Jujutsu (jj):"));
    console.log("  " + cyan("jj status") + "              Show jj workspace status");
    console.log("  " + cyan("jj diff") + "                Show jj diff of the current change");
    console.log("  " + cyan("jj log") + "                 Show recent jj commits (last 10)");
    console.log();
    console.log(bold("Agent:"));
    console.log("  " + cyan("agent models") + "            List available models from all harnesses");
    console.log();
    console.log(bold("Info:"));
    console.log("  " + cyan("vcs") + "                    Detect which VCS is in use (git/jj/none)");
    console.log();
}

// ---------------------------------------------------------------------------
// Main CLI router
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
        printHelp();
        return;
    }

    const command = args[0]!;
    const rest = args.slice(1);

    switch (command) {
        case "diff":
            await cmdDiff(rest);
            break;
        case "files":
            await cmdFiles(rest);
            break;
        case "git":
            cmdGit(rest);
            break;
        case "jj":
            cmdJj(rest);
            break;
        case "agent":
            await cmdAgent(rest);
            break;
        case "vcs":
            await cmdVcs();
            break;
        default:
            console.error(red(`Unknown command: ${command}`));
            console.error(`Run ${cyan("comment help")} for available commands.`);
            process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// diff command
// ---------------------------------------------------------------------------

async function cmdDiff(args: string[]): Promise<void> {
    const nameOnly = args.includes("--name-only");
    const statOnly = args.includes("--stat");
    const stagedOnly = args.includes("--staged");

    const root = process.cwd();
    const vcsType = detectVcsType(root);

    if (vcsType === "none") {
        console.log(red("No version control system detected."));
        return;
    }

    console.log(dim(`VCS: ${vcsType}`));

    if (nameOnly) {
        const files = getChangedFiles(root);
        for (const f of files) {
            console.log(f);
        }
        return;
    }

    const info = await collectDiffInfo(root);

    if (info.changedFiles.length === 0) {
        console.log(green("No changes detected."));
        return;
    }

    for (const file of info.changedFiles) {
        // Skip if --staged and file has no staged changes
        if (stagedOnly && file.staged !== "staged" && file.staged !== "both") { continue; }

        // Choose old/new based on --staged flag
        const oldContent = file.oldContent;
        const newContent = file.newContent;

        if (statOnly) {
            const result = diffLines(oldContent, newContent);
            const stats = getDiffStats(result);
            const statusTag = statusLabel(file.status, file.staged);
            console.log(` ${statusTag} ${yellow(file.relativePath)}  ${green(`+${stats.added}`)} ${red(`-${stats.removed}`)}`);
            continue;
        }

        // Full diff
        const statusTag = statusLabel(file.status, file.staged);
        const header = `\n${bold(statusTag + " " + file.relativePath)}`;
        printDivider(header);

        if (file.status === "deleted") {
            const lines = oldContent.split("\n");
            for (const line of lines) {
                console.log(red(`-${line}`));
            }
            continue;
        }

        if (file.status === "untracked" || file.status === "added") {
            const lines = newContent.split("\n");
            for (const line of lines) {
                console.log(green(`+${line}`));
            }
            continue;
        }

        // Modified: show unified diff
        const result = diffLines(oldContent, newContent);
        printUnifiedDiff(result);
    }
}

// ---------------------------------------------------------------------------
// files command
// ---------------------------------------------------------------------------

async function cmdFiles(_args: string[]): Promise<void> {
    const root = process.cwd();
    const vcsType = detectVcsType(root);

    if (vcsType === "none") {
        console.log(red("No version control system detected."));
        return;
    }

    const info = await collectDiffInfo(root);

    if (info.changedFiles.length === 0) {
        console.log(green("No changes."));
        return;
    }

    console.log(dim(`${vcsType} — ${info.changedFiles.length} changed file(s)`));
    console.log();

    for (const file of info.changedFiles) {
        console.log(` ${statusLabel(file.status, file.staged)} ${file.relativePath}`);
    }
}

// ---------------------------------------------------------------------------
// git command
// ---------------------------------------------------------------------------

function cmdGit(args: string[]): void {
    const root = process.cwd();
    const vcsType = detectVcsType(root);

    if (vcsType !== "git") {
        console.error(red("Not a git repository (detected: " + vcsType + ")"));
        console.error("Git commands only work inside git repositories.");
        process.exit(1);
    }

    if (args.length === 0) {
        console.error(red("Missing git subcommand. Available: stage, unstage, status"));
        console.error("Usage: comment git <stage|unstage|status> [file]");
        process.exit(1);
    }

    const subcommand = args[0]!;
    const filePath = args[1];

    switch (subcommand) {
        case "stage":
            if (!filePath) {
                console.error(red("Missing file path. Usage: comment git stage <file>"));
                process.exit(1);
            }
            stageFile(root, filePath);
            break;
        case "unstage":
            if (!filePath) {
                console.error(red("Missing file path. Usage: comment git unstage <file>"));
                process.exit(1);
            }
            unstageFile(root, filePath);
            break;
        case "status":
            showGitStatus(root);
            break;
        default:
            console.error(red(`Unknown git subcommand: ${subcommand}`));
            console.error("Available: stage, unstage, status");
            process.exit(1);
    }
}

function stageFile(root: string, filePath: string): void {
    const result = spawnSync("git", ["-C", root, "add", "--", filePath], { encoding: "utf8" });
    if (result.status !== 0) {
        console.error(red(`Failed to stage "${filePath}": ${result.stderr || "unknown error"}`));
        process.exit(1);
    }
    console.log(green(`Staged: ${filePath}`));
}

function unstageFile(root: string, filePath: string): void {
    const result = spawnSync("git", ["-C", root, "reset", "--", filePath], { encoding: "utf8" });
    if (result.status !== 0) {
        console.error(red(`Failed to unstage "${filePath}": ${result.stderr || "unknown error"}`));
        process.exit(1);
    }
    console.log(green(`Unstaged: ${filePath}`));
}

function showGitStatus(root: string): void {
    const result = spawnSync(
        "git",
        ["-C", root, "-c", "core.quotepath=false", "status", "--porcelain"],
        { encoding: "utf8" },
    );

    if (result.status !== 0) {
        console.error(red("Failed to get git status."));
        process.exit(1);
    }

    const output = (result.stdout ?? "").trim();
    if (!output) {
        console.log(green("Working tree clean."));
        return;
    }
    console.log(output);
}

// ---------------------------------------------------------------------------
// jj command
// ---------------------------------------------------------------------------

function cmdJj(args: string[]): void {
    const root = process.cwd();
    const vcsType = detectVcsType(root);

    if (vcsType !== "jj") {
        console.error(red("Not a jj repository (detected: " + vcsType + ")"));
        console.error("jj commands only work inside jj repositories.");
        process.exit(1);
    }

    if (args.length === 0) {
        console.error(red("Missing jj subcommand. Available: status, diff, log"));
        console.error("Usage: comment jj <status|diff|log>");
        process.exit(1);
    }

    const subcommand = args[0]!;

    switch (subcommand) {
        case "status":
            showJjStatus(root);
            break;
        case "diff":
            showJjDiff(root);
            break;
        case "log":
            showJjLog(root);
            break;
        default:
            console.error(red(`Unknown jj subcommand: ${subcommand}`));
            console.error("Available: status, diff, log");
            process.exit(1);
    }
}

function showJjStatus(root: string): void {
    const result = spawnSync("jj", ["status"], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
        console.error(red("Failed to get jj status: " + (result.stderr || "unknown error")));
        process.exit(1);
    }
    const output = (result.stdout ?? "").trim();
    if (!output) {
        console.log(green("Working copy is clean."));
        return;
    }
    console.log(output);
}

function showJjDiff(root: string): void {
    const result = spawnSync("jj", ["diff", "--color=always"], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
        console.error(red("Failed to get jj diff: " + (result.stderr || "unknown error")));
        process.exit(1);
    }
    const output = (result.stdout ?? "").trim();
    if (!output) {
        console.log(green("No changes."));
        return;
    }
    console.log(output);
}

function showJjLog(root: string): void {
    const result = spawnSync("jj", ["log", "-n", "10"], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
        console.error(red("Failed to get jj log: " + (result.stderr || "unknown error")));
        process.exit(1);
    }
    console.log((result.stdout ?? "").trim());
}

// ---------------------------------------------------------------------------
// agent command
// ---------------------------------------------------------------------------

async function cmdAgent(args: string[]): Promise<void> {
    if (args.length === 0) {
        console.error(red("Missing agent subcommand. Available: models"));
        console.error("Usage: comment agent models");
        process.exit(1);
    }

    const subcommand = args[0]!;

    switch (subcommand) {
        case "models":
            await cmdAgentModels();
            break;
        default:
            console.error(red(`Unknown agent subcommand: ${subcommand}`));
            console.error("Available: models");
            process.exit(1);
    }
}

async function cmdAgentModels(): Promise<void> {
    const { OpenCode } = await import("./tui/integrations/agents/opencode");
    const { Pi } = await import("./tui/integrations/agents/pi");
    const { Codex } = await import("./tui/integrations/agents/codex");
    const { ClaudeCode } = await import("./tui/integrations/agents/claude_code");

    const root = process.cwd();
    const dummyUpdates: import("./tui/types").AgentUpdate[] = [];

    const harnesses: Array<{ id: string; instance: import("./tui/integrations/agents/interface").BaseHarness }> = [
        { id: "opencode", instance: new OpenCode({ rootDir: root, initialUpdates: dummyUpdates }) },
        { id: "pi", instance: new Pi({ rootDir: root, initialUpdates: dummyUpdates }) },
        { id: "codex", instance: new Codex({ rootDir: root, initialUpdates: dummyUpdates }) },
        { id: "claude_code", instance: new ClaudeCode({ rootDir: root, initialUpdates: dummyUpdates }) },
    ];

    let total = 0;
    for (const { id, instance } of harnesses) {
        console.log(bold(`${id}:`));
        try {
            const models = await instance.listModels();
            if (models.length === 0) {
                console.log(dim("  (no models — may need login)"));
            } else {
                for (const m of models) {
                    const variantStr = m.variants.length > 0 ? dim(` [${m.variants.join(", ")}]`) : "";
                    console.log(`  ${m.model}${variantStr}`);
                    total += 1;
                }
            }
        } catch (error) {
            console.log(red(`  error: ${error instanceof Error ? error.message : String(error)}`));
        }
        console.log();
    }

    console.log(dim(`${total} model(s) total`));
}

async function cmdVcs(): Promise<void> {
    const root = process.cwd();
    const vcsType = detectVcsType(root);

    console.log(`VCS: ${vcsType}`);
    if (vcsType === "none") {
        console.log("No version control system found in this directory.");
        return;
    }

    const info = await collectDiffInfo(root);
    console.log(`Changed files: ${info.changedFiles.length}`);
    if (vcsType === "git") {
        console.log(`Staged changes: ${info.hasStagedChanges ? "yes" : "no"}`);
        console.log(`Unstaged changes: ${info.hasUnstagedChanges ? "yes" : "no"}`);
        console.log(`Untracked files: ${info.hasUntrackedFiles ? "yes" : "no"}`);
    }
}

// ---------------------------------------------------------------------------
// Shared rendering helpers
// ---------------------------------------------------------------------------

function statusLabel(status: ChangedFile["status"], staged: ChangedFile["staged"]): string {
    const sym = statusSymbol(status);
    const tag = staged ? `[${staged}]` : "";
    switch (status) {
        case "added": return green(`${sym}${tag}`);
        case "deleted": return red(`${sym}${tag}`);
        case "modified": return yellow(`${sym}${tag}`);
        case "renamed": return yellow(`${sym}${tag}`);
        case "untracked": return dim(`${sym}${tag}`);
    }
}

function statusSymbol(status: ChangedFile["status"]): string {
    switch (status) {
        case "modified": return "M";
        case "added": return "A";
        case "deleted": return "D";
        case "renamed": return "R";
        case "untracked": return "?";
        default: return "?";
    }
}

function printDivider(text: string): void {
    const width = Math.min(process.stdout.columns ?? 80, 120);
    const line = "─".repeat(Math.max(4, width - text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").length - 2));
    console.log(`${text} ${dim(line)}`);
}

function printUnifiedDiff(result: import("./tui/utils/diff").DiffResult): void {
    let oldLineNum = 1;
    let newLineNum = 1;

    for (const hunk of result.hunks) {
        if (hunk.kind === "equal") {
            for (let i = 0; i < hunk.oldLines.length; i += 1) {
                const line = hunk.newLines[i] ?? hunk.oldLines[i] ?? "";
                console.log(` ${line}`);
                oldLineNum += 1;
                newLineNum += 1;
            }
        } else if (hunk.kind === "delete") {
            for (const line of hunk.lines) {
                console.log(red(`-${line}`));
                oldLineNum += 1;
            }
        } else if (hunk.kind === "insert") {
            for (const line of hunk.lines) {
                console.log(green(`+${line}`));
                newLineNum += 1;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

main().catch((error) => {
    console.error(red(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
});
