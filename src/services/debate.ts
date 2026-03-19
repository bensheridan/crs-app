import Anthropic from "@anthropic-ai/sdk";
import { AIReviewResult } from "./ai.js";

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Increase retries so transient 429 rate-limit bursts are handled by the
    // SDK's built-in exponential backoff before surfacing to our code.
    maxRetries: 4,
});

export interface AIDebateResult {
    agreesWithPrimary: boolean;
    debateSummary: string;
    pointsOfContention: string[];
}

export interface RoundArgumentResult {
    argument: string;
    constitutionalReferences: string[];
    evidenceCitations: string[];
    coherenceRating: number;
}

export interface RoundRebuttalResult {
    rebuttal: string;
    agreesWithPrimary: boolean;
    constitutionalReferences: string[];
    evidenceCitations: string[];
    coherenceRating: number;
}

/**
 * Classifies an Anthropic SDK error into one of three buckets:
 *  - 'rate_limit'      HTTP 429 / rate_limit_error — transient, retry later
 *  - 'credit_exhausted' HTTP 402 or body contains credit/balance language — needs top-up
 *  - 'other'           Any other error
 *
 * Note: check err.error.message (API body) not err.message (SDK wrapper string).
 */
function classifyAnthropicError(err: any): 'rate_limit' | 'credit_exhausted' | 'other' {
    const status: number | undefined = err?.status;
    const errorType: string | undefined = err?.error?.type;
    // The actual Anthropic API error message lives at err.error.message, NOT err.message
    const apiMsg = (err?.error?.message ?? '').toLowerCase();

    if (status === 429 || errorType === 'rate_limit_error') {
        return 'rate_limit';
    }
    if (status === 402 || apiMsg.includes('credit') || apiMsg.includes('insufficient') || apiMsg.includes('balance')) {
        return 'credit_exhausted';
    }
    return 'other';
}

/** Strips markdown code fences that Claude occasionally adds despite instructions. */
function cleanJsonResponse(text: string): string {
    let jsonText = text;
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return jsonText.trim();
}

export async function generateDebateReview(
    diff: string,
    constitution: string,
    primaryReview: AIReviewResult
): Promise<AIDebateResult> {
    const prompt = `
    You are the "Devil's Advocate" AI of the Constitutional Review Studio (CRS).
    Another AI agent has just reviewed a Pull Request against the Constitution.
    Your mission is to critically analyze the **Primary Review** and try to find flaws, false positives, or missed violations.

    Constitution:
    ${constitution}

    PR Diff:
    ---
    ${diff}
    ---

    Primary AI Review to Critique:
    ${JSON.stringify(primaryReview, null, 2)}

    Please output a JSON object with the following structure:
    {
      "agreesWithPrimary": true/false, // false if you strongly disagree with any flagged items or missed violations
      "debateSummary": "A concise summary of your critique of the primary review.",
      "pointsOfContention": ["List of specific points where you disagree with the primary review, e.g., 'Clause X was not actually violated because...'"]
    }
  `;

    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            temperature: 0.7,
            system: "You are a critical AI reviewer that outputs strictly valid JSON. Do not include markdown formatting or reasoning text.",
            messages: [
                { role: "user", content: prompt }
            ]
        });

        const contentBlock = response.content[0];
        if (contentBlock.type !== 'text') throw new Error("Unexpected content format from Anthropic Debate");

        return JSON.parse(cleanJsonResponse(contentBlock.text)) as AIDebateResult;
    } catch (err: any) {
        const kind = classifyAnthropicError(err);
        const apiMessage = err?.error?.message || err?.message || String(err);

        if (kind === 'rate_limit') {
            // Transient — the debate will be skipped this run; the PR review still posts.
            // Caller (debateOrchestrator) already wraps this in a try/catch that continues.
            console.warn(`⚠️ Anthropic rate limit in generateDebateReview: ${apiMessage}`);
            throw new Error(`Anthropic API rate limit hit during generateDebateReview (HTTP 429). Push another commit to retry. API detail: ${apiMessage}`);
        }

        if (kind === 'credit_exhausted') {
            if (process.env.DEBATE_DEMO_MODE !== 'true') {
                throw new Error(`Anthropic account has insufficient credits during generateDebateReview. API detail: ${apiMessage}. Set DEBATE_DEMO_MODE=true to enable mock fallback for demos.`);
            }
            console.warn("⚠️ DEBATE_DEMO_MODE: Anthropic credits exhausted. Returning Mock Debate Data.");
            return {
                agreesWithPrimary: false,
                debateSummary: "While the primary reviewer correctly identified the hardcoded secret, it failed to fully analyze the severity of the architectural violation. Using raw JavaScript (`test.js`) entirely defeats our TypeScript compilation pipelines.",
                pointsOfContention: [
                    "The primary reviewer approved the 'Business Logic' tile, but hardcoding secrets constitutes a severe business logic failure.",
                    "The penalty should be escalated; the PR author should not only be blocked but requested to run a full repository secret scan."
                ]
            };
        }

        throw err;
    }
}

export async function generatePrimaryArgument(
    diff: string,
    constitution: string,
    primaryReview: AIReviewResult,
    previousRounds: { argument: string; rebuttal: string }[]
): Promise<RoundArgumentResult> {
    const previousRoundsContext = previousRounds.length > 0
        ? `Previous Debate Rounds:\n${previousRounds.map((r, i) => `Round ${i + 1}:\n  Your Argument: ${r.argument}\n  Devil's Advocate Rebuttal: ${r.rebuttal}`).join("\n\n")}`
        : "This is the first round of the debate. No previous rounds exist.";

    const prompt = `
    You are the "Primary Reviewer" AI of the Constitutional Review Studio (CRS).
    You originally reviewed a Pull Request against the Constitution and produced findings.
    Now you must defend or refine your findings in a structured debate.

    Constitution:
    ${constitution}

    PR Diff:
    ---
    ${diff}
    ---

    Your Original Review:
    ${JSON.stringify(primaryReview, null, 2)}

    ${previousRoundsContext}

    Based on the above, produce your argument for this round. Defend your findings, address any rebuttals from previous rounds, and refine your position if warranted.

    Please output a JSON object with the following structure:
    {
      "argument": "Your detailed argument defending or refining your review findings.",
      "constitutionalReferences": ["List of specific constitution clauses you reference in your argument"],
      "evidenceCitations": ["List of specific evidence from the PR diff that supports your argument, e.g., 'line 5: DB_PASSWORD = ...'"],
      "coherenceRating": 0-100 // Your self-assessment of how coherent and well-supported your argument is
    }
  `;

    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            temperature: 0.5,
            system: "You are a specialized AI reviewer that outputs strictly valid JSON. Do not include markdown formatting or reasoning text.",
            messages: [
                { role: "user", content: prompt }
            ]
        });

        const contentBlock = response.content[0];
        if (contentBlock.type !== 'text') throw new Error("Unexpected content format from Anthropic Primary Argument");

        return JSON.parse(cleanJsonResponse(contentBlock.text)) as RoundArgumentResult;
    } catch (err: any) {
        const kind = classifyAnthropicError(err);
        const apiMessage = err?.error?.message || err?.message || String(err);

        if (kind === 'rate_limit') {
            console.warn(`⚠️ Anthropic rate limit in generatePrimaryArgument: ${apiMessage}`);
            throw new Error(`Anthropic API rate limit hit during generatePrimaryArgument (HTTP 429). Push another commit to retry. API detail: ${apiMessage}`);
        }

        if (kind === 'credit_exhausted') {
            if (process.env.DEBATE_DEMO_MODE !== 'true') {
                throw new Error(`Anthropic account has insufficient credits during generatePrimaryArgument. API detail: ${apiMessage}. Set DEBATE_DEMO_MODE=true to enable mock fallback for demos.`);
            }
            console.warn("⚠️ DEBATE_DEMO_MODE: Anthropic credits exhausted. Returning Mock Primary Argument.");
            return {
                argument: "The primary review correctly identified a hardcoded secret in dbSettings.js. The DB_PASSWORD variable on line 5 contains a plaintext credential, which violates the 'No Hardcoded Secrets' clause. Additionally, introducing a .js file violates the 'TypeScript Only' architectural rule.",
                constitutionalReferences: ["No Hardcoded Secrets", "TypeScript Only"],
                evidenceCitations: ["line 5: DB_PASSWORD = 'super_secret_password'", "file: dbSettings.js (JavaScript, not TypeScript)"],
                coherenceRating: 78
            };
        }

        throw err;
    }
}

export async function generateDevilRebuttal(
    diff: string,
    constitution: string,
    primaryReview: AIReviewResult,
    currentArgument: string,
    previousRounds: { argument: string; rebuttal: string }[]
): Promise<RoundRebuttalResult> {
    const previousRoundsContext = previousRounds.length > 0
        ? `Previous Debate Rounds:\n${previousRounds.map((r, i) => `Round ${i + 1}:\n  Primary Argument: ${r.argument}\n  Your Rebuttal: ${r.rebuttal}`).join("\n\n")}`
        : "This is the first round of the debate. No previous rounds exist.";

    const prompt = `
    You are the "Devil's Advocate" AI of the Constitutional Review Studio (CRS).
    Your mission is to critically challenge the Primary Reviewer's argument using the constitution and the PR diff as evidence.

    Constitution:
    ${constitution}

    PR Diff:
    ---
    ${diff}
    ---

    Original Primary Review:
    ${JSON.stringify(primaryReview, null, 2)}

    ${previousRoundsContext}

    Current Round - Primary Reviewer's Argument:
    ${currentArgument}

    Critically analyze the Primary Reviewer's argument. Challenge weak points, identify logical gaps, or acknowledge strong arguments. If you fully agree with the Primary Reviewer on all points, set agreesWithPrimary to true.

    Please output a JSON object with the following structure:
    {
      "rebuttal": "Your detailed rebuttal challenging or acknowledging the Primary Reviewer's argument.",
      "agreesWithPrimary": true/false, // true only if you fully agree with all points in the Primary Reviewer's argument
      "constitutionalReferences": ["List of specific constitution clauses you reference in your rebuttal"],
      "evidenceCitations": ["List of specific evidence from the PR diff that supports your rebuttal"],
      "coherenceRating": 0-100 // Your self-assessment of how coherent and well-supported your rebuttal is
    }
  `;

    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            temperature: 0.7,
            system: "You are a critical AI reviewer that outputs strictly valid JSON. Do not include markdown formatting or reasoning text.",
            messages: [
                { role: "user", content: prompt }
            ]
        });

        const contentBlock = response.content[0];
        if (contentBlock.type !== 'text') throw new Error("Unexpected content format from Anthropic Devil Rebuttal");

        return JSON.parse(cleanJsonResponse(contentBlock.text)) as RoundRebuttalResult;
    } catch (err: any) {
        const kind = classifyAnthropicError(err);
        const apiMessage = err?.error?.message || err?.message || String(err);

        if (kind === 'rate_limit') {
            console.warn(`⚠️ Anthropic rate limit in generateDevilRebuttal: ${apiMessage}`);
            throw new Error(`Anthropic API rate limit hit during generateDevilRebuttal (HTTP 429). Push another commit to retry. API detail: ${apiMessage}`);
        }

        if (kind === 'credit_exhausted') {
            if (process.env.DEBATE_DEMO_MODE !== 'true') {
                throw new Error(`Anthropic account has insufficient credits during generateDevilRebuttal. API detail: ${apiMessage}. Set DEBATE_DEMO_MODE=true to enable mock fallback for demos.`);
            }
            console.warn("⚠️ DEBATE_DEMO_MODE: Anthropic credits exhausted. Returning Mock Devil Rebuttal.");
            return {
                rebuttal: "While the primary reviewer's identification of the hardcoded secret is valid, the severity assessment is incomplete. The 'Business Logic' tile was approved despite the secret being a core business logic failure. Furthermore, the reviewer did not recommend a full repository secret scan.",
                agreesWithPrimary: false,
                constitutionalReferences: ["No Hardcoded Secrets", "TypeScript Only"],
                evidenceCitations: ["line 5: DB_PASSWORD = 'super_secret_password'"],
                coherenceRating: 72
            };
        }

        throw err;
    }
}
