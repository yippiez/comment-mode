/**
 * Measures the Review Diff Feed pipeline and virtualized OpenTUI render cost.
 *
 * Usage:
 *   bun run scripts/profile-review-tui.ts
 */
import { createTestRenderer } from "@opentui/core/testing";
import { ReviewTuiApp } from "../tui/app2/review_tui_app";
import { buildReviewDiffFeed } from "../tui/domain/review_diff_feed";
import { collectDiffInfo } from "../tui/integrations/version_control/interface";

type ProfileMetrics = {
  readonly files: number;
  readonly feedRows: number;
  readonly hunks: number;
  readonly collectDiffMs: number;
  readonly buildFeedMs: number;
  readonly firstRenderMs: number;
  readonly pooledRenderables: number;
};

/** Measures one Review TUI render against the current workspace diff. */
async function profileReviewTui(rootDir: string): Promise<ProfileMetrics> {
    const collectStart = performance.now();
    const diffInfo = await collectDiffInfo(rootDir);
    const collectEnd = performance.now();

    const feed = buildReviewDiffFeed(diffInfo);
    const feedEnd = performance.now();

    const testRenderer = await createTestRenderer({ width: 120, height: 30 });
    try {
        const app = new ReviewTuiApp(testRenderer.renderer, rootDir);
        app["feed"] = feed;
        const renderStart = performance.now();
        app["render"]();
        await testRenderer.renderOnce();
        const renderEnd = performance.now();

        return {
            files: diffInfo.changedFiles.length,
            feedRows: feed.rows.length,
            hunks: feed.hunks.length,
            collectDiffMs: roundMs(collectEnd - collectStart),
            buildFeedMs: roundMs(feedEnd - collectEnd),
            firstRenderMs: roundMs(renderEnd - renderStart),
            pooledRenderables: app["rowPool"].length,
        };
    } finally {
        testRenderer.renderer.destroy();
    }
}

/** Rounds a duration to one decimal place. */
function roundMs(value: number): number {
    return Math.round(value * 10) / 10;
}

const metrics = await profileReviewTui(process.cwd());
console.log(JSON.stringify(metrics, null, 2));
