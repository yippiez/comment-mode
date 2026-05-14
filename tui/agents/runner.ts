/**
 * Agent Runner module: launches concrete agent CLI adapters and streams
 * normalized Agent Run Events through one small interface.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseAgentStreamLine, type AgentId, type AgentRunEvent } from "./events";

export const DEFAULT_AGENT_MODEL = "opencode-go/deepseek-v4-flash";

export type AgentRunRequest = {
  readonly agent: AgentId;
  readonly rootDir: string;
  readonly model: string;
  readonly prompt: string;
  readonly autoApproveEdits: boolean;
};

export type AgentRunCallbacks = {
  readonly onEvent: (event: AgentRunEvent) => void;
  readonly onExit: (result: AgentRunExit) => void;
};

export type AgentRunExit = {
  readonly success: boolean;
  readonly code: number | null;
  readonly error?: string;
};

export type AgentRunHandle = {
  readonly id: string;
  readonly stop: () => void;
};

type AgentCommand = {
  readonly command: string;
  readonly args: readonly string[];
};

/**
 * Launches an agent CLI and streams normalized run events.
 * @param request - Agent command and prompt request
 * @param callbacks - Event and lifecycle callbacks
 * @returns A handle that can stop the process
 */
export function runAgent(request: AgentRunRequest, callbacks: AgentRunCallbacks): AgentRunHandle {
    const id = `run-${randomUUID().slice(0, 8)}`;
    const command = buildAgentCommand(request);
    const child = spawn(command.command, command.args, {
        cwd: request.rootDir,
        stdio: ["ignore", "pipe", "pipe"],
    });

    let finished = false;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let lastError: string | undefined;

    const finish = (result: AgentRunExit): void => {
        if (finished) { return; }
        finished = true;
        callbacks.onExit(result);
    };

    const consume = (rawLine: string, fromStderr: boolean): void => {
        const events = parseAgentStreamLine(request.agent, rawLine);
        for (const event of events) {
            callbacks.onEvent(event);
            if (event.kind === "error" || event.isError) {
                lastError = event.text;
            }
        }
        if (fromStderr && events.length === 0 && rawLine.trim().length > 0) {
            const text = rawLine.trim();
            lastError = text;
            callbacks.onEvent({ kind: "error", text, rawType: "stderr", isError: true });
        }
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
        stdoutBuffer = consumeBufferedLines(stdoutBuffer, String(chunk), (line) => {
            consume(line, false);
        });
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
        stderrBuffer = consumeBufferedLines(stderrBuffer, String(chunk), (line) => {
            consume(line, true);
        });
    });

    child.on("error", (error) => {
        const message = toErrorMessage(error);
        callbacks.onEvent({ kind: "error", text: message, rawType: "spawn_error", isError: true });
        finish({ success: false, code: null, error: message });
    });

    child.on("close", (code) => {
        if (stdoutBuffer.trim().length > 0) { consume(stdoutBuffer, false); }
        if (stderrBuffer.trim().length > 0) { consume(stderrBuffer, true); }
        if (code === 0 && !lastError) {
            finish({ success: true, code });
            return;
        }
        finish({
            success: false,
            code,
            error: lastError ?? `${request.agent} exited with status ${String(code ?? 1)}`,
        });
    });

    return {
        id,
        stop: () => stopChild(child),
    };
}

/**
 * Builds the concrete command for an Agent Adapter.
 * @param request - Agent run request
 * @returns Command and arguments for child_process.spawn
 */
export function buildAgentCommand(request: AgentRunRequest): AgentCommand {
    if (request.agent === "pi") {
        return {
            command: "pi",
            args: [
                "--mode", "json",
                "--print",
                "--no-session",
                "--model", request.model,
                request.prompt,
            ],
        };
    }

    const args = [
        "run",
        request.prompt,
        "--format", "json",
        "--model", request.model,
    ];
    if (request.autoApproveEdits) {
        args.push("--dangerously-skip-permissions");
    }
    return {
        command: "opencode",
        args,
    };
}

/** Consumes complete newline-delimited records from a stream buffer. */
function consumeBufferedLines(
    buffer: string,
    chunk: string,
    onLine: (line: string) => void,
): string {
    const full = buffer + chunk;
    const parts = full.split(/\r?\n/);
    const tail = parts.pop() ?? "";
    for (const line of parts) {
        onLine(line);
    }
    return tail;
}

/** Stops a child process without throwing when it is already gone. */
function stopChild(child: ChildProcess): void {
    if (child.killed) { return; }
    child.kill("SIGTERM");
}

/** Converts unknown thrown values into displayable error messages. */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) { return error.message; }
    return String(error);
}
