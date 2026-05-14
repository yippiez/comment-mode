#!/usr/bin/env bun
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
    console.log("  " + cyan("agent run") + "               Run Pi/OpenCode with diff/range context");
    console.log("                             --agent <pi|opencode> --model <id> --file <path>");
    console.log("                             --start <line> --end <line> --prompt <text>");
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
    if (args.length === 0) {
        const { startTui } = await import("./tui/index");
        await startTui(process.cwd());
        return;
    }

    if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
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
        console.error(red("Missing agent subcommand. Available: models, run"));
        console.error("Usage: comment agent <models|run>");
        process.exit(1);
    }

    const subcommand = args[0]!;

    switch (subcommand) {
        case "models":
            await cmdAgentModels();
            break;
        case "run":
            await cmdAgentRun(args.slice(1));
            break;
        default:
            console.error(red(`Unknown agent subcommand: ${subcommand}`));
            console.error("Available: models, run");
            process.exit(1);
    }
}

type AgentRunCliOptions = {
  agent: "opencode" | "pi";
  model: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  prompt: string;
};

/**
 * Runs an agent from CLI flags and streams normalized events for testing.
 * @param args - CLI arguments after `comment agent run`
 */
async function cmdAgentRun(args: string[]): Promise<void> {
    const { runAgent, DEFAULT_AGENT_MODEL } = await import("./tui/agents/runner");
    const { buildPromptContext } = await import("./tui/domain/prompt_context");
    const { formatAgentRunEvent } = await import("./tui/agents/events");
    const options = parseAgentRunCliOptions(args, DEFAULT_AGENT_MODEL);
    const root = process.cwd();
    const selection = await buildCliReviewSelection(root, options);
    const context = buildPromptContext({
        selection,
        userPrompt: options.prompt,
        agent: options.agent,
        model: options.model,
    });

    console.log(dim(`agent=${options.agent} model=${options.model}`));
    console.log(dim(`context=${context.filePath}:${context.startLine}-${context.endLine}`));

    await new Promise<void>((resolve) => {
        runAgent({
            agent: options.agent,
            rootDir: root,
            model: options.model,
            prompt: context.message,
            autoApproveEdits: true,
        }, {
            onEvent: (event) => {
                const text = formatAgentRunEvent(event);
                if (event.kind === "error") {
                    console.error(red(text));
                    return;
                }
                console.log(text);
            },
            onExit: (result) => {
                if (result.success) {
                    console.log(green("agent completed"));
                } else {
                    console.error(red(result.error ?? "agent failed"));
                    process.exitCode = 1;
                }
                resolve();
            },
        });
    });
}

/** Parses flags for `comment agent run`. */
function parseAgentRunCliOptions(args: string[], defaultModel: string): AgentRunCliOptions {
    const value = (name: string): string | null => {
        const index = args.indexOf(name);
        if (index < 0) { return null; }
        return args[index + 1] ?? null;
    };
    const agentText = value("--agent") ?? "opencode";
    const agent = agentText === "pi" ? "pi" : "opencode";
    const startLine = parseOptionalLine(value("--start"));
    const endLine = parseOptionalLine(value("--end"));
    const prompt = value("--prompt") ?? collectAgentRunPositionals(args).join(" ");

    return {
        agent,
        model: value("--model") ?? defaultModel,
        filePath: value("--file"),
        startLine,
        endLine,
        prompt: prompt.trim().length > 0 ? prompt : "Review the selected diff context and improve it.",
    };
}

/** Collects positional prompt words while skipping flag values. */
function collectAgentRunPositionals(args: string[]): string[] {
    const result: string[] = [];
    const flagsWithValues = new Set(["--agent", "--model", "--file", "--start", "--end", "--prompt"]);
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index] ?? "";
        if (flagsWithValues.has(arg)) {
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) { continue; }
        result.push(arg);
    }
    return result;
}

/** Parses a positive line number flag. */
function parseOptionalLine(value: string | null): number | null {
    if (!value) { return null; }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Builds a Review Selection for CLI agent runs. */
async function buildCliReviewSelection(
    root: string,
    options: AgentRunCliOptions,
): Promise<import("./tui/domain/review_diff_feed").ReviewSelection> {
    const diffInfo = await collectDiffInfo(root);
    const file = options.filePath
        ? diffInfo.changedFiles.find((entry) => entry.relativePath === options.filePath)
        : diffInfo.changedFiles[0];

    if (!file) {
        console.error(red("No changed file available for agent context."));
        process.exit(1);
    }

    const content = file.newContent || file.oldContent;
    const lines = content.split("\n");
    const startLine = options.startLine ?? 1;
    const endLine = options.endLine ?? Math.max(startLine, Math.min(lines.length, startLine + 80));
    const selectedText = lines.slice(startLine - 1, endLine).join("\n");
    const diffText = renderFileDiffText(file);

    return {
        filePath: file.relativePath,
        startLine,
        endLine,
        rowStart: 0,
        rowEnd: 0,
        selectedText,
        diffText,
        hunkId: null,
    };
}

/** Renders one changed file as plain diff text for CLI Prompt Context. */
function renderFileDiffText(file: ChangedFile): string {
    const oldContent = file.oldContent;
    const newContent = file.newContent;
    const result = diffLines(oldContent, newContent);
    const lines: string[] = [`${file.status.toUpperCase()} ${file.relativePath}`];
    for (const hunk of result.hunks) {
        if (hunk.kind === "equal") {
            for (const line of hunk.newLines) { lines.push(` ${line}`); }
        } else if (hunk.kind === "delete") {
            for (const line of hunk.lines) { lines.push(`-${line}`); }
        } else {
            for (const line of hunk.lines) { lines.push(`+${line}`); }
        }
    }
    return lines.join("\n");
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
            console.log(red(`  error: ${toErrorMessage(error)}`));
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

/** Converts unknown thrown values into displayable error messages. */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) { return error.message; }
    return String(error);
}

main().catch((error) => {
    console.error(red(`Unexpected error: ${toErrorMessage(error)}`));
    process.exit(1);
});
