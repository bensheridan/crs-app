import { Context } from "probot";
import { fetchConstitution } from "../utils/constitution.js";
import { generatePRReview, AIReviewResult } from "../services/ai.js";
import { orchestrateDebate, MultiRoundDebateResult } from "../services/debateOrchestrator.js";
import { logViolation, getRecentViolations, getHardBlockClauses } from "../services/violations.js";
import { fetchConfig } from "../utils/config.js";
import { createReviewCheck } from "../handlers/checkRun.js";
import { upsertProposal } from "../services/proposalService.js";

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
    const clauses = await fetchConstitution(context);
    const constitution = clauses.length > 0
        ? clauses.map(c => `- [${c.category}] ${c.title}: ${c.description}`).join("\n")
        : "No constitution exists yet.";

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
            constitution,
            pr.title,
            pr.body || "",
            recentViolationsFormatted,
            hardBlockClausesFormatted
        );
    } catch (err) {
        _logger.error({ err }, "Failed to generate AI review");
        return;
    }

    // 3.5 Fetch config & Generate Multi-Round AI Debate
    const config = await fetchConfig(context);

    _logger.info("Generating multi-round AI Debate...");
    let debateResult: MultiRoundDebateResult | undefined;
    try {
        debateResult = await orchestrateDebate(
            diff,
            constitution,
            aiResult,
            config.maxDebateRounds,
            pr.number,
            repo.owner.login,
            repo.name
        );
    } catch (err) {
        _logger.error({ err }, "Failed to generate AI Debate review (continuing anyway)");
    }

    // 4. Log Violations (Clauses Touched)
    if (aiResult.clausesTouched && aiResult.clausesTouched.length > 0) {
        for (const clauseTitle of aiResult.clausesTouched) {
            const author = pr.user ? pr.user.login : "unknown_agent";
            await logViolation(clauseTitle, pr.number, author, "gpt-4o");
        }
    }

    // 4.5 Persist AI-suggested clauses as proposals
    if (aiResult.suggestedClauses && aiResult.suggestedClauses.length > 0) {
        for (const suggestion of aiResult.suggestedClauses) {
            await upsertProposal({
                title: suggestion.title,
                description: suggestion.description,
                reason: suggestion.reason,
                prNumber: pr.number,
                repoOwner: repo.owner.login,
                repoName: repo.name,
            });
        }
    }

    // 5. Build and Create Check Run
    _logger.info("Executing Constitutional Review checking process...");
    await createReviewCheck(context as Context<"pull_request">, aiResult, config);

    // 6. Format Comment
    const suggestionsForComment: SuggestionWithCount[] = (aiResult.suggestedClauses || []).map(s => ({
        title: s.title,
        description: s.description,
        reason: s.reason,
    }));
    const commentBody = formatReviewComment(aiResult, debateResult, suggestionsForComment);

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

export interface SuggestionWithCount {
    title: string;
    description: string;
    reason: string;
    suggestionCount?: number;
}

export function formatReviewComment(
    result: AIReviewResult,
    debateResult?: MultiRoundDebateResult,
    suggestionsWithCounts?: SuggestionWithCount[]
): string {
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

    const suggestions: SuggestionWithCount[] = suggestionsWithCounts && suggestionsWithCounts.length > 0
        ? suggestionsWithCounts
        : (result.suggestedClauses || []).map(s => ({ title: s.title, description: s.description, reason: s.reason }));

    const suggestionsMarkdown = suggestions.length > 0
        ? suggestions.map(s => {
            const countLabel = s.suggestionCount && s.suggestionCount > 1 ? ` *(Suggested ${s.suggestionCount} times)*` : "";
            return `> **${s.title}**${countLabel}\n> ${s.description}\n> *Reason: ${s.reason}*\n> \`/crs adopt ${s.title}\` · \`/crs reject ${s.title}\``;
        }).join("\n\n") + "\n\n> 💡 **Tip:** Use `/crs adopt <title>` to add a clause to the constitution, or `/crs reject <title>` to dismiss it."
        : "No new clauses suggested.";

    let debateMarkdown = "";
    if (debateResult) {
        const roundsMarkdown = debateResult.rounds.map(round => {
            return `### Round ${round.roundNumber} — Score: ${round.score}/100 (${round.strengthLabel})
**Primary Reviewer:**
${round.primaryArgument}

**Devil's Advocate:**
${round.devilRebuttal}`;
        }).join("\n\n");

        const earlyTermination = debateResult.terminatedEarly
            ? "\n\n> ✅ Debate concluded early — consensus reached."
            : "";

        debateMarkdown = `## 🤼 AI Debate Summary

**Debate Confidence: ${debateResult.debateConfidence}/100 (${debateResult.confidenceLabel})**
Rounds completed: ${debateResult.totalRoundsCompleted}/${debateResult.maxRoundsConfigured}

${roundsMarkdown}${earlyTermination}

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
