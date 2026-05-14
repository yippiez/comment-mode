/**
 * Prompt Context module: materializes a Review Selection and user instruction
 * into the stable prompt sent to an Agent Adapter.
 */
import type { AgentId } from "../agents/events";
import type { ReviewSelection } from "./review_diff_feed";

export type PromptContextRequest = {
  readonly selection: ReviewSelection;
  readonly userPrompt: string;
  readonly agent: AgentId;
  readonly model: string;
};

export type PromptContext = {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly agent: AgentId;
  readonly model: string;
  readonly userPrompt: string;
  readonly message: string;
};

/**
 * Builds the full agent prompt from a Review Selection and user instruction.
 * @param request - Selection, prompt, and agent metadata
 * @returns Complete Prompt Context for an Agent Run
 */
export function buildPromptContext(request: PromptContextRequest): PromptContext {
    const prompt = request.userPrompt.trim().length > 0
        ? request.userPrompt.trim()
        : "Review this selected diff context and make the most useful code improvement.";
    const selection = request.selection;
    const message = [
        "You are editing a workspace during an agentic code review.",
        "Apply the requested change directly when appropriate.",
        "Keep the change focused on the selected context unless the fix requires nearby edits.",
        "",
        `File: ${selection.filePath}`,
        `Selected lines: ${selection.startLine}-${selection.endLine}`,
        "",
        "User instruction:",
        prompt,
        "",
        "Selected text:",
        fenced(selection.selectedText),
        "",
        "Relevant diff context:",
        fenced(selection.diffText),
    ].join("\n");

    return {
        filePath: selection.filePath,
        startLine: selection.startLine,
        endLine: selection.endLine,
        agent: request.agent,
        model: request.model,
        userPrompt: prompt,
        message,
    };
}

/** Wraps prompt context in a markdown code fence. */
function fenced(text: string): string {
    return ["```", text, "```"].join("\n");
}
