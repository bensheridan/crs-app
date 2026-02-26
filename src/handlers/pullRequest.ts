import { Context } from "probot";
import { fetchConstitution } from "../utils/constitution.js";
import { generatePRReview, AIReviewResult } from "../services/ai.js";
import { generateDebateReview, AIDebateResult } from "../services/debate.js";
import { logViolation, getRecentViolations, getHardBlockClauses } from "../services/violations.js";
import { fetchConfig } from "../utils/config.js";
import { createReviewCheck } from "../handlers/checkRun.js";

type PRContext = Context<"pull_request.opened"> | Context<"pull_request.synchronize">;

export async function handlePullRequest(context: PRContext) {
    const pr = context.payload.pull_request;
    const repo = context.payload.repository;
    const _logger = context.log;

    // 1. Get PR Diff
    let diff = "";
    try {
        const diffResponse = await context.octokit.pulls.get({
            owner: repo.owner.login,
            repo: repo.name,
            pull_number: pr.number,
            mediaType: {
                format: "diff",
            },
        });
        diff = String(diffResponse.data);
    } catch (err) {
        _logger.error({ err }, "Failed to fetch PR diff");
        return;
    }

    if (!diff) {
        _logger.info("PR diff is empty, skipping review.");
        return;
    }

    // 2. Fetch Constitution & Recent Violations & Hard Blocks
    const constitution = await fetchConstitution(context);

    let recentViolationsFormatted = "None";
    let hardBlockClausesFormatted = "None";
    try {
        const recentViolations = await getRecentViolations(5);
        if (recentViolations && recentViolations.length > 0) {
            recentViolationsFormatted = recentViolations.map((v: any) =>
                `- Clause: ${v.clause?.title} (PR #${v.pr_number})`
            ).join("\n");
        }

        const hardBlockClauses = await getHardBlockClauses();
        if (hardBlockClauses && hardBlockClauses.length > 0) {
            hardBlockClausesFormatted = hardBlockClauses.map((c: any) =>
                `- ${c.title} (Confidence: ${c.confidence_score}/100)`
            ).join("\n");
        }
    } catch (err) {
        _logger.error({ err }, "Failed to fetch DB clause modifiers");
    }

    // 3. Generate AI Review
    _logger.info("Generating AI review...");
    let aiResult: AIReviewResult;
    try {
        aiResult = await generatePRReview(
            diff,
            constitution || "No constitution exists yet.",
            pr.title,
            pr.body || "",
            recentViolationsFormatted,
            hardBlockClausesFormatted
        );
    } catch (err) {
        _logger.error({ err }, "Failed to generate AI review");
        return;
    }

    // 3.5 Generate AI Debate Review
    _logger.info("Generating AI Debate (Devil's Advocate) review...");
    let debateResult: AIDebateResult | undefined;
    try {
        debateResult = await generateDebateReview(
            diff,
            constitution || "No constitution exists yet.",
            aiResult
        );
    } catch (err) {
        _logger.error({ err }, "Failed to generate AI Debate review (continuing anyway)");
    }

    // 4. Log Violations (Clauses Touched)
    if (aiResult.clausesTouched && aiResult.clausesTouched.length > 0) {
        for (const clauseTitle of aiResult.clausesTouched) {
            // we assume the PR author is the AI agent trigger or "unknown"
            const author = pr.user ? pr.user.login : "unknown_agent";
            await logViolation(clauseTitle, pr.number, author, "gpt-4o");
        }
    }

    // 5. Build and Create Check Run
    _logger.info("Executing Constitutional Review checking process...");
    const config = await fetchConfig(context);
    await createReviewCheck(context as Context<"pull_request">, aiResult, config);

    // 6. Format Comment
    const commentBody = formatReviewComment(aiResult, debateResult);

    // 7. Post Comment
    try {
        await context.octokit.issues.createComment({
            owner: repo.owner.login,
            repo: repo.name,
            issue_number: pr.number,
            body: commentBody,
        });
        _logger.info("Successfully posted AI review comment.");
    } catch (err) {
        _logger.error({ err }, "Failed to post PR comment");
    }
}

function formatReviewComment(result: AIReviewResult, debateResult?: AIDebateResult): string {
    const tilesMarkdown = result.reviewTiles.map(tile => {
        const icon = tile.status === 'approved' ? '✅' : tile.status === 'flagged' ? '❌' : '⏳';
        return `### ${icon} ${tile.name} [${tile.status.toUpperCase()}]
${tile.description}`;
    }).join("\n\n");

    const clausesMarkdown = result.clausesTouched && result.clausesTouched.length > 0
        ? result.clausesTouched.map(c => `- ${c}`).join("\n")
        : "No relevant clauses detected.";

    const riskAreasMarkdown = result.riskAreas && result.riskAreas.length > 0
        ? result.riskAreas.map(r => `- ${r}`).join("\n")
        : "No immediate risks identified.";

    const suggestionsMarkdown = result.suggestedClauses && result.suggestedClauses.length > 0
        ? result.suggestedClauses.map(s => `> **${s.title}**\n> ${s.description}\n> *Reason: ${s.reason}*`).join("\n\n")
        : "No new clauses suggested.";

    let debateMarkdown = "";
    if (debateResult) {
        const agreementIcon = debateResult.agreesWithPrimary ? '🤝' : '🧑‍⚖️';
        const contentionPoints = debateResult.pointsOfContention.length > 0
            ? debateResult.pointsOfContention.map(p => `- ${p}`).join("\n")
            : "The secondary AI strongly agreed with the primary assessment and found no major constitutional flaws.";

        debateMarkdown = `### ${agreementIcon} AI Debate: Devil's Advocate
        
> **Debate Summary:** ${debateResult.debateSummary}

**Points of Contention:**
${contentionPoints}

---
`;
    }

    return `## 🏛️ Constitutional Review Studio 🏛️

**AI Intent Summary:**
> ${result.intentSummary}

---

### ⚠️ Risk Areas
${riskAreasMarkdown}

---

### 📜 Constitution Clauses Touched (Violations Logged)
${clausesMarkdown}

---

### 💡 Suggested New Constitution Clauses
${suggestionsMarkdown}

---

${debateMarkdown}
## Review Tiles

${tilesMarkdown}

---
*Interact with me! Use \`/crs approve <tile_name>\` or \`/crs flag <tile_name> <reason>\` to update the review status.*`;
}
