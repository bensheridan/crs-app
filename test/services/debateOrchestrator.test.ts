// Feature: multi-model-debate-scoring, Properties 1–3
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Mocks (hoisted so vi.mock factories can reference them) ──────────────────

const { mockGeneratePrimaryArgument, mockGenerateDevilRebuttal, mockPrisma } =
  vi.hoisted(() => ({
    mockGeneratePrimaryArgument: vi.fn(),
    mockGenerateDevilRebuttal: vi.fn(),
    mockPrisma: {
      debateRecord: { create: vi.fn() },
    },
  }));

vi.mock("../../src/services/debate.js", () => ({
  generatePrimaryArgument: (...args: unknown[]) =>
    mockGeneratePrimaryArgument(...args),
  generateDevilRebuttal: (...args: unknown[]) =>
    mockGenerateDevilRebuttal(...args),
}));

vi.mock("../../src/services/db.js", () => ({
  prisma: mockPrisma,
}));

// ── Import SUT after mocks ──────────────────────────────────────────────────

import { orchestrateDebate } from "../../src/services/debateOrchestrator.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockPrimaryReview = {
  overallAssessment: "test",
  violations: [],
  suggestions: [],
  score: 80,
};

/** Build a unique RoundArgumentResult for a given call index */
function makeArgResult(index: number) {
  return {
    argument: `primary-argument-${index}`,
    constitutionalReferences: [`ref-${index}`],
    evidenceCitations: [`cite-${index}`],
    coherenceRating: 70,
  };
}

/** Build a unique RoundRebuttalResult for a given call index, optionally agreeing */
function makeRebuttalResult(index: number, agrees: boolean) {
  return {
    rebuttal: `devil-rebuttal-${index}`,
    agreesWithPrimary: agrees,
    constitutionalReferences: [`devil-ref-${index}`],
    evidenceCitations: [`devil-cite-${index}`],
    coherenceRating: 65,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("debateOrchestrator property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.debateRecord.create.mockResolvedValue({});
  });

  // ── Property 1: Round count within configured bounds ─────────────────────
  // Feature: multi-model-debate-scoring, Property 1: Round count within configured bounds
  // **Validates: Requirements 1.1**
  describe("Property 1: Round count within configured bounds", () => {
    it("for any maxRounds M in [2, 5], totalRoundsCompleted is between 1 and M inclusive", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (maxRounds) => {
            let argCallCount = 0;
            let rebuttalCallCount = 0;

            mockGeneratePrimaryArgument.mockImplementation(async () => {
              return makeArgResult(argCallCount++);
            });

            // Always disagree so the debate runs all rounds
            mockGenerateDevilRebuttal.mockImplementation(async () => {
              return makeRebuttalResult(rebuttalCallCount++, false);
            });

            const result = await orchestrateDebate(
              "diff",
              "constitution",
              mockPrimaryReview as any,
              maxRounds
            );

            expect(result.totalRoundsCompleted).toBeGreaterThanOrEqual(1);
            expect(result.totalRoundsCompleted).toBeLessThanOrEqual(maxRounds);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 2: Transcript contains all round content ────────────────────
  // Feature: multi-model-debate-scoring, Property 2: Transcript contains all round content
  // **Validates: Requirements 1.4**
  describe("Property 2: Transcript contains all round content", () => {
    it("for any completed rounds, the transcript contains every primary argument and devil rebuttal in order", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (maxRounds) => {
            let argCallCount = 0;
            let rebuttalCallCount = 0;

            mockGeneratePrimaryArgument.mockImplementation(async () => {
              return makeArgResult(argCallCount++);
            });

            // Always disagree so all rounds run
            mockGenerateDevilRebuttal.mockImplementation(async () => {
              return makeRebuttalResult(rebuttalCallCount++, false);
            });

            const result = await orchestrateDebate(
              "diff",
              "constitution",
              mockPrimaryReview as any,
              maxRounds
            );

            const transcript = result.debateTranscript;

            // Every round's content must appear in the transcript
            for (let i = 0; i < result.totalRoundsCompleted; i++) {
              expect(transcript).toContain(`primary-argument-${i}`);
              expect(transcript).toContain(`devil-rebuttal-${i}`);
            }

            // Verify ordering: each round's argument appears before the next round's argument
            for (let i = 0; i < result.totalRoundsCompleted - 1; i++) {
              const currentArgPos = transcript.indexOf(`primary-argument-${i}`);
              const nextArgPos = transcript.indexOf(`primary-argument-${i + 1}`);
              expect(currentArgPos).toBeLessThan(nextArgPos);

              const currentRebuttalPos = transcript.indexOf(`devil-rebuttal-${i}`);
              const nextRebuttalPos = transcript.indexOf(`devil-rebuttal-${i + 1}`);
              expect(currentRebuttalPos).toBeLessThan(nextRebuttalPos);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 3: Early termination on agreement ───────────────────────────
  // Feature: multi-model-debate-scoring, Property 3: Early termination on agreement
  // **Validates: Requirements 1.5**
  describe("Property 3: Early termination on agreement", () => {
    it("when Devil's Advocate agrees at round K, totalRoundsCompleted === K and terminatedEarly === true", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 1, max: 5 }),
          async (maxRounds, rawK) => {
            // Ensure K is within [1, maxRounds]
            const K = Math.min(rawK, maxRounds);

            let argCallCount = 0;
            let rebuttalCallCount = 0;

            mockGeneratePrimaryArgument.mockImplementation(async () => {
              return makeArgResult(argCallCount++);
            });

            // Agree on the Kth call (0-indexed: K-1), disagree on all others
            mockGenerateDevilRebuttal.mockImplementation(async () => {
              const currentCall = rebuttalCallCount++;
              const agrees = currentCall === K - 1;
              return makeRebuttalResult(currentCall, agrees);
            });

            const result = await orchestrateDebate(
              "diff",
              "constitution",
              mockPrimaryReview as any,
              maxRounds
            );

            expect(result.totalRoundsCompleted).toBe(K);
            expect(result.terminatedEarly).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 9: Debate persistence round trip ────────────────────────────
  // Feature: multi-model-debate-scoring, Property 9: Debate persistence round trip
  // **Validates: Requirements 4.1, 4.2, 4.3**
  describe("Property 9: Debate persistence round trip", () => {
    it("for any completed debate, persisted data matches PR number, repo owner, repo name, confidence, label, total rounds, terminated early, and round scores", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10000 }),       // prNumber
          fc.stringMatching(/^[a-z]{1,10}$/),        // repoOwner
          fc.stringMatching(/^[a-z]{1,10}$/),        // repoName
          fc.integer({ min: 2, max: 5 }),            // maxRounds
          fc.boolean(),                               // whether to terminate early
          async (prNumber, repoOwner, repoName, maxRounds, terminateEarly) => {
            let argCallCount = 0;
            let rebuttalCallCount = 0;
            // If terminating early, agree on round 1; otherwise run all rounds
            const agreeAtRound = terminateEarly ? 0 : -1;

            mockGeneratePrimaryArgument.mockImplementation(async () => {
              return makeArgResult(argCallCount++);
            });

            mockGenerateDevilRebuttal.mockImplementation(async () => {
              const currentCall = rebuttalCallCount++;
              const agrees = currentCall === agreeAtRound;
              return makeRebuttalResult(currentCall, agrees);
            });

            // Capture what gets persisted
            let capturedData: any = null;
            mockPrisma.debateRecord.create.mockImplementation(async (args: any) => {
              capturedData = args.data;
              return {};
            });

            const result = await orchestrateDebate(
              "diff",
              "constitution",
              mockPrimaryReview as any,
              maxRounds,
              prNumber,
              repoOwner,
              repoName
            );

            // Verify prisma.debateRecord.create was called
            expect(capturedData).not.toBeNull();

            // Assert persisted fields match the debate result
            expect(capturedData.pr_number).toBe(prNumber);
            expect(capturedData.repo_owner).toBe(repoOwner);
            expect(capturedData.repo_name).toBe(repoName);
            expect(capturedData.debate_confidence).toBe(result.debateConfidence);
            expect(capturedData.confidence_label).toBe(result.confidenceLabel);
            expect(capturedData.total_rounds).toBe(result.totalRoundsCompleted);
            expect(capturedData.terminated_early).toBe(result.terminatedEarly);

            // Assert round scores match
            const persistedRounds = capturedData.rounds.create;
            expect(persistedRounds).toHaveLength(result.rounds.length);
            for (let i = 0; i < result.rounds.length; i++) {
              expect(persistedRounds[i].score).toBe(result.rounds[i].score);
              expect(persistedRounds[i].round_number).toBe(result.rounds[i].roundNumber);
              expect(persistedRounds[i].strength_label).toBe(result.rounds[i].strengthLabel);
              expect(persistedRounds[i].primary_argument).toBe(result.rounds[i].primaryArgument);
              expect(persistedRounds[i].devil_rebuttal).toBe(result.rounds[i].devilRebuttal);
              expect(persistedRounds[i].coherence_rating).toBe(result.rounds[i].coherenceRating);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
