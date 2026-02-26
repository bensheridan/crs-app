import { Context } from "probot";
import { CRSConfig } from "../utils/config.js";
import { AIReviewResult } from "../services/ai.js";

// Uses the GitHub Check Runs API to report the Constitutional Review Status
export async function createReviewCheck(
    context: Context<"pull_request">,
    reviewResult: AIReviewResult,
    config: CRSConfig
) {
    const pr = context.payload.pull_request;
    const repo = context.payload.repository;

    const hasFlaggedTiles = reviewResult.reviewTiles.some(t => t.status === "flagged");
    let checkConclusion: "success" | "failure" | "neutral" | "action_required" = "success";

    // Determine conclusion based on config gating mode
    if (hasFlaggedTiles) {
        if (config.gatingMode === "hard_block") {
            checkConclusion = "failure";
        } else if (config.gatingMode === "soft_block") {
            checkConclusion = "action_required"; // Allows manual override in GitHub UI
        } else {
            checkConclusion = "neutral"; // Advisory mode: doesn't block
        }

        // Advanced Governance: Clause-level Hard Block Override
        if (reviewResult.clausesTouched && reviewResult.clausesTouched.length > 0) {
            try {
                const { prisma } = await import("../services/db.js");
                const touchedHardBlocks = await prisma.clause.count({
                    where: {
                        title: { in: reviewResult.clausesTouched },
                        enforcement_level: "hard_block"
                    }
                });
                if (touchedHardBlocks > 0) {
                    context.log.info("A Hard Block constitution clause was violated. Forcing Check Run failure.");
                    checkConclusion = "failure";
                }
            } catch (err) {
                context.log.error({ err }, "Failed to query hard blocks during check run evaluation.");
            }
        }
    }

    // Build the Check Run output
    const outputTitle = hasFlaggedTiles
        ? `${checkConclusion === 'failure' ? '(Blocked) ' : ''}Review Tiles Flagged by Constitution`
        : `Constitution Aligned`;

    const summaryMarkdown = `
**AI Intent Summary:**
> ${reviewResult.intentSummary}

### 📜 Constitution Clauses Touched
${reviewResult.clausesTouched && reviewResult.clausesTouched.length > 0
            ? reviewResult.clausesTouched.map(c => `- ${c}`).join("\n")
            : "No relevant clauses detected."}
`;

    try {
        await context.octokit.checks.create({
            owner: repo.owner.login,
            repo: repo.name,
            head_sha: pr.head.sha,
            name: "Constitutional Review",
            status: "completed", // or "in_progress" if doing it asynchronously over a longer period
            conclusion: checkConclusion,
            output: {
                title: outputTitle,
                summary: summaryMarkdown,
                text: "Review the PR comment for detailed Review Tiles and interactions."
            }
        });
        context.log.info(`Created Constitutional Review Check Run (Conclusion: ${checkConclusion})`);
    } catch (err) {
        context.log.error({ err }, "Failed to create GitHub Check Run");
    }
}
