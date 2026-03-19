import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatReviewComment, SuggestionWithCount } from "../../src/handlers/pullRequest.js";
import { AIReviewResult } from "../../src/services/ai.js";
import { MultiRoundDebateResult, DebateRoundResult } from "../../src/services/debateOrchestrator.js";

// Feature: constitution-auto-evolution, Property 9: Actionable comment formatting
// **Validates: Requirements 8.1, 8.2, 8.3**
describe("Property 9: Actionable comment formatting", () => {
  const suggestionArb: fc.Arbitrary<SuggestionWithCount> = fc.record({
    title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    description: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    reason: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    suggestionCount: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  });

  const suggestionsArb = fc.array(suggestionArb, { minLength: 1, maxLength: 5 });

  const minimalAIResult: AIReviewResult = {
    intentSummary: "dummy summary",
    riskAreas: [],
    reviewTiles: [],
    clausesTouched: [],
    suggestedClauses: [],
  };

  it("formatted comment contains adopt/reject commands, suggestion counts when > 1, and instruction line", () => {
    fc.assert(
      fc.property(suggestionsArb, (suggestions) => {
        const comment = formatReviewComment(minimalAIResult, undefined, suggestions);

        for (const s of suggestions) {
          // (a) Contains /crs adopt <title> and /crs reject <title>
          expect(comment).toContain(`/crs adopt ${s.title}`);
          expect(comment).toContain(`/crs reject ${s.title}`);

          // (b) If suggestionCount > 1, contains "Suggested N times"
          if (s.suggestionCount !== undefined && s.suggestionCount > 1) {
            expect(comment).toContain(`Suggested ${s.suggestionCount} times`);
          }
        }

        // (c) Contains instruction tip line
        expect(comment).toContain("/crs adopt <title>");
        expect(comment).toContain("/crs reject <title>");
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: multi-model-debate-scoring, Property 10: PR comment contains all debate information
// **Validates: Requirements 5.1, 5.2, 5.4**
describe("formatReviewComment with MultiRoundDebateResult", () => {
  const minimalAIResult: AIReviewResult = {
    intentSummary: "dummy summary",
    riskAreas: [],
    reviewTiles: [],
    clausesTouched: [],
    suggestedClauses: [],
  };

  function makeDebateResult(overrides?: Partial<MultiRoundDebateResult>): MultiRoundDebateResult {
    const rounds: DebateRoundResult[] = [
      {
        roundNumber: 1,
        primaryArgument: "Primary argument round 1",
        devilRebuttal: "Devil rebuttal round 1",
        agreesWithPrimary: false,
        constitutionalReferences: ["ref-1"],
        evidenceCitations: ["cite-1"],
        coherenceRating: 70,
        score: 65,
        strengthLabel: "strong",
      },
      {
        roundNumber: 2,
        primaryArgument: "Primary argument round 2",
        devilRebuttal: "Devil rebuttal round 2",
        agreesWithPrimary: false,
        constitutionalReferences: ["ref-2"],
        evidenceCitations: ["cite-2"],
        coherenceRating: 60,
        score: 55,
        strengthLabel: "strong",
      },
    ];
    return {
      rounds,
      debateConfidence: 58,
      confidenceLabel: "moderate",
      totalRoundsCompleted: 2,
      maxRoundsConfigured: 3,
      terminatedEarly: false,
      debateTranscript: "transcript",
      ...overrides,
    };
  }

  it("renders debate confidence score and label", () => {
    const debate = makeDebateResult();
    const comment = formatReviewComment(minimalAIResult, debate);
    expect(comment).toContain("Debate Confidence: 58/100 (moderate)");
  });

  it("renders rounds completed as X/Y", () => {
    const debate = makeDebateResult();
    const comment = formatReviewComment(minimalAIResult, debate);
    expect(comment).toContain("Rounds completed: 2/3");
  });

  it("renders each round with score and strength label", () => {
    const debate = makeDebateResult();
    const comment = formatReviewComment(minimalAIResult, debate);
    expect(comment).toContain("Round 1 — Score: 65/100 (strong)");
    expect(comment).toContain("Round 2 — Score: 55/100 (strong)");
    expect(comment).toContain("Primary argument round 1");
    expect(comment).toContain("Devil rebuttal round 1");
    expect(comment).toContain("Primary argument round 2");
    expect(comment).toContain("Devil rebuttal round 2");
  });

  it("renders early termination consensus message when terminatedEarly is true", () => {
    const debate = makeDebateResult({ terminatedEarly: true });
    const comment = formatReviewComment(minimalAIResult, debate);
    expect(comment).toContain("Debate concluded early — consensus reached");
  });

  it("does not render early termination message when terminatedEarly is false", () => {
    const debate = makeDebateResult({ terminatedEarly: false });
    const comment = formatReviewComment(minimalAIResult, debate);
    expect(comment).not.toContain("consensus reached");
  });

  it("renders AI Debate Summary heading", () => {
    const debate = makeDebateResult();
    const comment = formatReviewComment(minimalAIResult, debate);
    expect(comment).toContain("🤼 AI Debate Summary");
  });

  it("does not render debate section when debateResult is undefined", () => {
    const comment = formatReviewComment(minimalAIResult, undefined);
    expect(comment).not.toContain("AI Debate Summary");
    expect(comment).not.toContain("Debate Confidence");
  });
});

// Feature: multi-model-debate-scoring, Property 10: PR comment contains all debate information
// **Validates: Requirements 5.1, 5.2, 5.4**
describe("Property 10: PR comment contains all debate information", () => {
  const minimalAIResult: AIReviewResult = {
    intentSummary: "dummy summary",
    riskAreas: [],
    reviewTiles: [],
    clausesTouched: [],
    suggestedClauses: [],
  };

  const strengthLabelArb = fc.constantFrom("weak" as const, "strong" as const);
  const confidenceLabelArb = fc.constantFrom("high" as const, "moderate" as const, "low" as const);

  const debateRoundArb: fc.Arbitrary<DebateRoundResult> = fc.record({
    roundNumber: fc.integer({ min: 1, max: 5 }),
    primaryArgument: fc.string({ minLength: 1, maxLength: 80 }),
    devilRebuttal: fc.string({ minLength: 1, maxLength: 80 }),
    agreesWithPrimary: fc.boolean(),
    constitutionalReferences: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
    evidenceCitations: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
    coherenceRating: fc.integer({ min: 0, max: 100 }),
    score: fc.integer({ min: 0, max: 100 }),
    strengthLabel: strengthLabelArb,
  });

  const debateResultArb: fc.Arbitrary<MultiRoundDebateResult> = fc
    .tuple(
      fc.array(debateRoundArb, { minLength: 1, maxLength: 5 }),
      fc.integer({ min: 0, max: 100 }),
      confidenceLabelArb,
      fc.integer({ min: 1, max: 5 }),
      fc.boolean(),
      fc.string({ minLength: 0, maxLength: 100 }),
    )
    .map(([rounds, debateConfidence, confidenceLabel, maxRoundsConfigured, terminatedEarly, debateTranscript]) => {
      // Re-number rounds sequentially so roundNumber matches position
      const numberedRounds = rounds.map((r, i) => ({ ...r, roundNumber: i + 1 }));
      return {
        rounds: numberedRounds,
        debateConfidence,
        confidenceLabel,
        totalRoundsCompleted: numberedRounds.length,
        maxRoundsConfigured: Math.max(maxRoundsConfigured, numberedRounds.length),
        terminatedEarly,
        debateTranscript,
      };
    });

  it("formatted comment contains each round's score and strength label, debate confidence, confidence label, and X/Y rounds format", () => {
    fc.assert(
      fc.property(debateResultArb, (debateResult) => {
        const comment = formatReviewComment(minimalAIResult, debateResult);

        // Each round's score in "Score: {score}/100" format and strength label
        for (const round of debateResult.rounds) {
          expect(comment).toContain(`Score: ${round.score}/100`);
          expect(comment).toContain(round.strengthLabel);
        }

        // Debate confidence in "Debate Confidence: {confidence}/100" format
        expect(comment).toContain(`Debate Confidence: ${debateResult.debateConfidence}/100`);

        // Confidence label
        expect(comment).toContain(debateResult.confidenceLabel);

        // Rounds completed in "X/Y" format
        expect(comment).toContain(
          `${debateResult.totalRoundsCompleted}/${debateResult.maxRoundsConfigured}`
        );
      }),
      { numRuns: 100 }
    );
  });
});
