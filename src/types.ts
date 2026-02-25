import type { CodeRenderable, LineNumberRenderable, RGBA } from "@opentui/core";

/**
 * App-level focus target for keyboard routing.
 *
 * - `chips`: file-type chips row
 * - `code`: main content area (code/files/agent timeline)
 * - `prompt`: inline prompt composer
 */
export type FocusMode = "chips" | "code" | "prompt";

/**
 * Active content presentation in the main viewport.
 *
 * - `code`: source-file oriented view
 * - `files`: file-tree oriented view
 */
export type ViewMode = "code" | "files";

/**
 * Logical block category stored in the line model.
 *
 * Used for rendering decisions, selection behavior, and prompt-building rules.
 */
export type BlockKind = "code" | "collapsed" | "agent" | "file";

/**
 * Agent provider/runtime implementation used for prompt execution.
 */
export type AgentHarness = "opencode";

/**
 * Resolved model identifier (for example `opencode/big-pickle`).
 */
export type AgentModel = string;

/**
 * Lifecycle state of an agent update run.
 */
export type AgentUpdateStatus = "draft" | "running" | "completed" | "failed";

/**
 * Normalized source file loaded into the TUI.
 */
export type CodeFileEntry = {
  /** Path relative to the repository root. */
  relativePath: string;
  /** Full file text used for rendering and line extraction. */
  content: string;
  /** Whether `content` currently contains loaded source text. */
  isContentLoaded: boolean;
  /** Optional syntax-highlighting filetype override. */
  filetype?: string;
  /** Logical file-type chip label (for filtering). */
  typeLabel: string;
  /** Sort/group priority used when presenting type chips. */
  typePriority: number;
  /** Total number of lines in `content`. */
  lineCount: number;
  /** 1-based file line numbers currently marked as uncommitted. */
  uncommittedLines: Set<number>;
  /** True when the whole file should be marked as uncommitted. */
  markAllLinesUncommitted: boolean;
};

/**
 * Persisted prompt/update record rendered in the agent timeline.
 */
export type AgentUpdate = {
  /** Stable local ID for update tracking and editing. */
  id: string;
  /** View mode used when the update was created. */
  contextMode?: ViewMode;
  /** Target file path for this prompt context. */
  filePath: string;
  /** First selected file line (1-based, inclusive). */
  selectionStartFileLine: number;
  /** Last selected file line (1-based, inclusive). */
  selectionEndFileLine: number;
  /** Materialized text sent as prompt context. */
  selectedText: string;
  /** User-authored prompt text. */
  prompt: string;
  /** Backend harness used to execute the request. */
  harness: AgentHarness;
  /** Model name used for this run. */
  model: AgentModel;
  /** Optional reasoning/thinking variant. */
  variant?: string;
  /** Current execution status. */
  status: AgentUpdateStatus;
  /** Optional backend run identifier. */
  runId?: string;
  /** Recent status/progress messages for timeline rendering. */
  messages: string[];
  /** Optional terminal error message for failed runs. */
  error?: string;
};

/**
 * Per-line sign decoration shown by line-number renderables.
 */
export type LineSign = {
  before?: string;
  beforeColor?: string | RGBA;
  after?: string;
  afterColor?: string | RGBA;
};

/**
 * Line-sign decorations keyed by block-local line offset.
 */
export type LineSignsByOffset = Map<number, LineSign>;

/**
 * Fully rendered block metadata tracked by `LineModel`.
 *
 * Each block corresponds to a contiguous run of rendered lines and links
 * visual renderables to logical/global line mapping.
 */
export type RenderedLineBlock = {
  /** Optional line-number wrapper for code/collapsed blocks. */
  lineView: LineNumberRenderable | null;
  /** Optional code/text renderable for the block body. */
  codeView: CodeRenderable | null;
  /** Default line-number foreground used when highlights are reset. */
  defaultLineNumberFg: string;
  /** Default line-sign state used when highlights are reset. */
  defaultLineSigns: LineSignsByOffset;
  /** Kind of content represented by this rendered block. */
  blockKind: BlockKind;
  /** First file line represented by this block, if any. */
  fileLineStart: number | null;
  /** Rendered text lines in display order for selection/prompt extraction. */
  renderedLines: string[];
  /** First global line number represented by this block (1-based). */
  lineStart: number;
  /** Last global line number represented by this block (1-based, inclusive). */
  lineEnd: number;
  /** File path associated with this block. */
  filePath: string;
};
