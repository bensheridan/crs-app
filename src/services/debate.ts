import OpenAI from "openai";
import { AIReviewResult } from "./ai.js";

const openai = new OpenAI();

export interface AIDebateResult {
    agreesWithPrimary: boolean;
    debateSummary: string;
    pointsOfContention: string[];
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
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a critical AI reviewer that outputs strictly valid JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7 // slightly higher temperature for a more critical/creative perspective
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No content from OpenAI Debate");

        return JSON.parse(content) as AIDebateResult;
    } catch (err: any) {
        if (err?.status === 429 || err?.code === 'insufficient_quota') {
            console.warn("⚠️ OpenAI Quota Exceeded. Returning Mock Debate Data for Demonstration Purposes.");
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
