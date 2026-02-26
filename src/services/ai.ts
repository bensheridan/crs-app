import OpenAI from "openai";

const openai = new OpenAI();

export interface AIReviewResult {
  intentSummary: string;
  riskAreas: string[];
  reviewTiles: {
    name: string;
    description: string;
    status: 'pending' | 'approved' | 'flagged';
  }[];
  clausesTouched: string[];
  suggestedClauses: {
    title: string;
    description: string;
    reason: string;
  }[];
}

export async function generatePRReview(
  diff: string,
  constitution: string,
  prTitle: string,
  prBody: string,
  recentViolations: string = "None",
  hardBlockClausesFormatted: string = "None"
): Promise<AIReviewResult> {
  const prompt = `
    You are an expert AI governance engine called Constitutional Review Studio (CRS).
    Your job is to analyze the following Pull Request against the provided Constitution.

    Constitution:
    ${constitution}

    🚨 HARD BLOCK CLAUSES (STRICT ENFORCEMENT) 🚨
    The following clauses have reached a 100% confidence score due to repeated violations. 
    You MUST exhibit zero tolerance. If you detect ANY deviation or violation of these rules, you must immediately flag the relevant review tiles and note the violation.
    ${hardBlockClausesFormatted}

    Recent Violations on this Repository (to help identify recurring mistakes):
    ${recentViolations}

    PR Title: ${prTitle}
    PR Body: ${prBody}

    PR Diff:
    ---
    ${diff}
    ---

    Please output a JSON object with the following structure:
    {
      "intentSummary": "A concise summary of the AI's intent in this PR",
      "riskAreas": ["List of potential risks or areas requiring careful human review"],
      "reviewTiles": [
        {
          "name": "Business Logic",
          "description": "Short explanation of business logic changes",
          "status": "pending"
        },
        ... (Include tiles for 'Error Handling', 'Test Coverage', 'Spec Alignment', 'Architecture Impact')
      ],
      "clausesTouched": ["List of clause titles from the constitution that might be relevant to this PR"],
      "suggestedClauses": [
        {
          "title": "A short, imperative title for a new rule",
          "description": "The description of the rule",
          "reason": "Why this rule is being suggested based on the PR diff or recurring mistakes"
        }
      ]
    }
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a specialized AI reviewer that outputs strictly valid JSON." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No content from OpenAI");

  return JSON.parse(content) as AIReviewResult;
}
