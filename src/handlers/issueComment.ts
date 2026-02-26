import { Context } from "probot";
import { fetchConfig } from "../utils/config.js";
import { createReviewCheck } from "./checkRun.js";
import { trackReviewerAction } from "../services/reviewers.js";

export async function handleIssueComment(context: Context<"issue_comment.created">) {
    const comment = context.payload.comment;
    const issue = context.payload.issue;
    const repo = context.payload.repository;
    const _logger = context.log;

    // 1. Check if comment is from a bot or if it's not a PR.
    if (comment.user?.type === "Bot") {
        return;
    }

    if (!issue.pull_request) {
        // Only process slash commands on PRs
        return;
    }

    // 2. Check for slash command
    const body = comment.body.trim();
    if (!body.startsWith("/crs ")) {
        return;
    }

    // Parse command
    const parts = body.split(/\s+/);
    if (parts.length < 3) {
        _logger.info("Invalid /crs command format");
        await postError(context, "Invalid command. Usage: `/crs approve <tile>` or `/crs flag <tile> <reason>`");
        return;
    }

    const action = parts[1].toLowerCase();
    const tileName = parts[2].toLowerCase(); // Basic handling of single-word tiles for now. We might need better parsing later.
    let reason = "";

    if (action === "flag") {
        if (parts.length < 4) {
            await postError(context, "Flag command requires a reason. Usage: `/crs flag <tile> <reason>`");
            return;
        }
        reason = parts.slice(3).join(" ");
    } else if (action !== "approve") {
        await postError(context, `Unknown action: \`${action}\`. Use \`approve\` or \`flag\`.`);
        return;
    }

    // 3. Find the bot's review comment on this PR
    // We need to fetch comments and find the one starting with "## 🏛️ Constitutional Review Studio 🏛️"
    let botComment;
    try {
        const commentsResponse = await context.octokit.issues.listComments({
            owner: repo.owner.login,
            repo: repo.name,
            issue_number: issue.number
        });
        // We assume the bot's login is something like "crs-app[bot]". It's safer to check the body.
        botComment = commentsResponse.data.find(c => c.body?.includes("## 🏛️ Constitutional Review Studio 🏛️"));
    } catch (err) {
        _logger.error({ err }, "Failed to fetch comments");
        return;
    }

    if (!botComment || !botComment.body) {
        await postError(context, "Could not find an existing CRS review comment on this PR.");
        return;
    }

    // 4. Update the Review Tile in the Markdown
    // This is a naive regex replacement. A more robust solution would be to parse the Markdown or store state in the DB.
    // Review tile format: `### [ICON] [Tile Name] [[STATUS]]`

    // We need to map the user input tileName to the actual tile name in the comment (case-insensitive)
    // E.g. "business logic" -> "Business Logic"

    const statusString = action === "approve" ? "[APPROVED]" : "[FLAGGED]";
    const icon = action === "approve" ? "✅" : "❌";

    // Create a regex to find the specific tile header. 
    // It looks for "###", an emoji, the tile name (ignoring case), and a status in brackets.
    const regex = new RegExp(`### [⏳✅❌].*?${escapeRegExp(tileName)}.*?\\[(PENDING|APPROVED|FLAGGED)\\]`, "i");

    const match = botComment.body.match(regex);

    if (!match) {
        await postError(context, `Could not find a review tile matching \`${tileName}\`.`);
        return;
    }

    // Extract the actual Tile Name from the match to preserve its casing
    // E.g. "### ⏳ Business Logic [PENDING]" -> "Business Logic"
    const actualTileNameMatch = match[0].match(/### [⏳✅❌]\s*(.*?)\s*\[/);
    const actualTileName = actualTileNameMatch ? actualTileNameMatch[1] : tileName;

    let newTileHeader = `### ${icon} ${actualTileName} ${statusString}`;
    if (action === "flag" && reason) {
        newTileHeader += `\n> **Flag Reason:** ${reason}`;
    }

    const newBody = botComment.body.replace(match[0], newTileHeader);

    // 5. Update the comment
    try {
        await context.octokit.issues.updateComment({
            owner: repo.owner.login,
            repo: repo.name,
            comment_id: botComment.id,
            body: newBody
        });
        _logger.info(`Successfully updated review tile: ${actualTileName} to ${statusString}`);

        // Optionally add a thumbs up reaction to the user's slash command comment!
        await context.octokit.reactions.createForIssueComment({
            owner: repo.owner.login,
            repo: repo.name,
            comment_id: comment.id,
            content: "+1"
        });

        // Track the reviewer's action
        if (comment.user) {
            await trackReviewerAction(comment.user.login, action as "approve" | "flag");
        }

        // 6. Update the GitHub Check Run
        // We need to re-evaluate if there are any remaining flagged tiles in the new body
        const config = await fetchConfig(context as any); // cast safely here to avoid TS payload mismatches
        const hasFlagsRemaining = newBody.includes("[FLAGGED]");

        // Mock up a skeletal AIReviewResult just for the check run creation logic
        const mockResultForCheck = {
            intentSummary: "Check PR comment for full intent summary.", // Or we could extract this from the comment body too.
            clausesTouched: [],
            riskAreas: [],
            reviewTiles: [
                { name: "Aggregate Status", description: "", status: hasFlagsRemaining ? "flagged" : "approved" as any }
            ],
            suggestedClauses: []
        };

        await createReviewCheck(context as any, mockResultForCheck, config);

    } catch (err) {
        _logger.error({ err }, "Failed to update bot comment");
    }
}

async function postError(context: Context<"issue_comment.created">, message: string) {
    try {
        await context.octokit.issues.createComment({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            body: `⚠️ **CRS Error:** ${message}`
        });
    } catch (err) {
        context.log.error({ err }, "Failed to post error message");
    }
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
