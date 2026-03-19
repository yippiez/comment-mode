import type { BlockKind } from "../types";

const BLOCK_KIND_RESTORE_ORDER: Record<BlockKind, readonly BlockKind[]> = {
    code: ["code", "collapsed", "file", "agent"],
    collapsed: ["collapsed", "code", "file", "agent"],
    file: ["file", "collapsed", "code", "agent"],
    agent: ["agent", "code", "collapsed", "file"],
};

/**
 * Returns a relative penalty for restoring to a candidate block kind.
 * @param candidate - The candidate block kind being considered for restore
 * @param preferred - The previously focused block kind, or null when unknown
 * @returns A non-negative score where lower values are better matches
 * @example
 * resolveBlockKindPenalty("code", "code") // 0
 * resolveBlockKindPenalty("collapsed", "code") // 1
 * resolveBlockKindPenalty("agent", null) // 0
 */
export function resolveBlockKindPenalty(candidate: BlockKind, preferred: BlockKind | null): number {
    if (!preferred) return 0;
    const order = BLOCK_KIND_RESTORE_ORDER[preferred];
    const index = order.indexOf(candidate);
    return index >= 0 ? index : order.length;
}
