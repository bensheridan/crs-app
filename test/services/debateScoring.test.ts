// Feature: multi-model-debate-scoring, Properties 4–8
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  scoreRound,
  computeDebateConfidence,
  getStrengthLabel,
  getConfidenceLabel,
} from "../../src/services/debateScoring.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Arbitrary for a valid RoundScoringInput */
const roundScoringInputArb = () =>
  fc.record({
    constitutionalReferences: fc.array(fc.string({ minLength: 1, maxLength: 40 }), {
      minLength: 0,
      maxLength: 10,
    }),
    evidenceCitations: fc.array(fc.string({ minLength: 1, maxLength: 40 }), {
      minLength: 0,
      maxLength: 10,
    }),
    coherenceRating: fc.integer({ min: 0, max: 100 }),
  });

// ── Tests ────────────────────────────────────────────────────────────────────

describe("debateScoring property tests", () => {
  // ── Property 4: Round score range invariant ──────────────────────────────
  // Feature: multi-model-debate-scoring, Property 4: Round score range invariant
  // **Validates: Requirements 2.1**
  describe("Property 4: Round score range invariant", () => {
    it("scoreRound always returns a value in [0, 100]", () => {
      fc.assert(
        fc.property(roundScoringInputArb(), (input) => {
          const score = scoreRound(input);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 5: Score increases with better inputs (metamorphic) ─────────
  // Feature: multi-model-debate-scoring, Property 5: Score increases with better inputs (metamorphic)
  // **Validates: Requirements 2.2**
  describe("Property 5: Score increases with better inputs", () => {
    it("adding more constitutional references produces score >= original", () => {
      fc.assert(
        fc.property(
          roundScoringInputArb(),
          fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 5 }),
          (input, extraRefs) => {
            const originalScore = scoreRound(input);
            const enhancedScore = scoreRound({
              ...input,
              constitutionalReferences: [...input.constitutionalReferences, ...extraRefs],
            });
            expect(enhancedScore).toBeGreaterThanOrEqual(originalScore);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("adding more evidence citations produces score >= original", () => {
      fc.assert(
        fc.property(
          roundScoringInputArb(),
          fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 5 }),
          (input, extraCitations) => {
            const originalScore = scoreRound(input);
            const enhancedScore = scoreRound({
              ...input,
              evidenceCitations: [...input.evidenceCitations, ...extraCitations],
            });
            expect(enhancedScore).toBeGreaterThanOrEqual(originalScore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 6: Strength label correctness ───────────────────────────────
  // Feature: multi-model-debate-scoring, Property 6: Strength label correctness
  // **Validates: Requirements 2.3, 2.4**
  describe("Property 6: Strength label correctness", () => {
    it('returns "weak" when score < 50 and "strong" when score >= 50', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
          const label = getStrengthLabel(score);
          if (score < 50) {
            expect(label).toBe("weak");
          } else {
            expect(label).toBe("strong");
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 7: Confidence is weighted average favoring later rounds ─────
  // Feature: multi-model-debate-scoring, Property 7: Confidence is weighted average favoring later rounds
  // **Validates: Requirements 3.2**
  describe("Property 7: Confidence weighted average", () => {
    it("computeDebateConfidence equals Math.round(Σ(score_i × i) / Σ(i))", () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 10 }),
          (scores) => {
            const result = computeDebateConfidence(scores);

            // Compute expected value independently
            let weightedSum = 0;
            let weightTotal = 0;
            for (let i = 0; i < scores.length; i++) {
              const weight = i + 1;
              weightedSum += scores[i] * weight;
              weightTotal += weight;
            }
            const expected = Math.round(weightedSum / weightTotal);

            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 8: Confidence label correctness ─────────────────────────────
  // Feature: multi-model-debate-scoring, Property 8: Confidence label correctness
  // **Validates: Requirements 3.3, 3.4, 3.5**
  describe("Property 8: Confidence label correctness", () => {
    it('returns "high" when >= 70, "moderate" when 40-69, "low" when < 40', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (confidence) => {
          const label = getConfidenceLabel(confidence);
          if (confidence >= 70) {
            expect(label).toBe("high");
          } else if (confidence >= 40) {
            expect(label).toBe("moderate");
          } else {
            expect(label).toBe("low");
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
