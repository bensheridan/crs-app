import { AIReviewResult } from "./ai.js";
import { generatePrimaryArgument, generateDevilRebuttal } from "./debate.js";
import { scoreRound, computeDebateConfidence, getStrengthLabel, getConfidenceLabel } from "./debateScoring.js";
import { prisma } from "./db.js";

export interface DebateRoundResult {
  roundNumber: number;
  primaryArgument: string;
  devilRebuttal: string;
  agreesWithPrimary: boolean;
  constitutionalReferences: string[];
  evidenceCitations: string[];
  coherenceRating: number;
  score: number;
  strengthLabel: "weak" | "strong";
}

export interface MultiRoundDebateResult {
  rounds: DebateRoundResult[];
  debateConfidence: number;
  confidenceLabel: "high" | "moderate" | "low";
  totalRoundsCompleted: number;
  maxRoundsConfigured: number;
  terminatedEarly: boolean;
  debateTranscript: string;
}

export async function orchestrateDebate(
  diff: string,
  constitution: string,
  primaryReview: AIReviewResult,
  maxRounds: number,
  prNumber: number = 0,
  repoOwner: string = "",
  repoName: string = ""
): Promise<MultiRoundDebateResult> {
  const rounds: DebateRoundResult[] = [];
  const previousRounds: { argument: string; rebuttal: string }[] = [];
  let terminatedEarly = false;

  for (let i = 0; i < maxRounds; i++) {
    const argResult = await generatePrimaryArgument(diff, constitution, primaryReview, previousRounds);
    const rebuttalResult = await generateDevilRebuttal(diff, constitution, primaryReview, argResult.argument, previousRounds);

    const allReferences = [...argResult.constitutionalReferences, ...rebuttalResult.constitutionalReferences];
    const allCitations = [...argResult.evidenceCitations, ...rebuttalResult.evidenceCitations];
    const avgCoherence = Math.round((argResult.coherenceRating + rebuttalResult.coherenceRating) / 2);

    const roundScore = scoreRound({
      constitutionalReferences: allReferences,
      evidenceCitations: allCitations,
      coherenceRating: avgCoherence,
    });

    const round: DebateRoundResult = {
      roundNumber: i + 1,
      primaryArgument: argResult.argument,
      devilRebuttal: rebuttalResult.rebuttal,
      agreesWithPrimary: rebuttalResult.agreesWithPrimary,
      constitutionalReferences: allReferences,
      evidenceCitations: allCitations,
      coherenceRating: avgCoherence,
      score: roundScore,
      strengthLabel: getStrengthLabel(roundScore),
    };

    rounds.push(round);
    previousRounds.push({ argument: argResult.argument, rebuttal: rebuttalResult.rebuttal });

    if (rebuttalResult.agreesWithPrimary) {
      terminatedEarly = true;
      break;
    }
  }

  const roundScores = rounds.map((r) => r.score);
  const debateConfidence = computeDebateConfidence(roundScores);
  const confidenceLabel = getConfidenceLabel(debateConfidence);

  const debateTranscript = rounds
    .map((r) =>
      `=== Round ${r.roundNumber} (Score: ${r.score}, ${r.strengthLabel}) ===\n` +
      `Primary Argument:\n${r.primaryArgument}\n\n` +
      `Devil's Advocate Rebuttal:\n${r.devilRebuttal}`
    )
    .join("\n\n");

  const result: MultiRoundDebateResult = {
    rounds,
    debateConfidence,
    confidenceLabel,
    totalRoundsCompleted: rounds.length,
    maxRoundsConfigured: maxRounds,
    terminatedEarly,
    debateTranscript,
  };

  // Persist to database — catch and log errors without blocking
  try {
    await prisma.debateRecord.create({
      data: {
        pr_number: prNumber,
        repo_owner: repoOwner,
        repo_name: repoName,
        debate_confidence: debateConfidence,
        confidence_label: confidenceLabel,
        total_rounds: rounds.length,
        max_rounds: maxRounds,
        terminated_early: terminatedEarly,
        transcript: debateTranscript,
        rounds: {
          create: rounds.map((r) => ({
            round_number: r.roundNumber,
            primary_argument: r.primaryArgument,
            devil_rebuttal: r.devilRebuttal,
            score: r.score,
            strength_label: r.strengthLabel,
            constitutional_references: r.constitutionalReferences,
            evidence_citations: r.evidenceCitations,
            coherence_rating: r.coherenceRating,
          })),
        },
      },
    });
  } catch (err) {
    console.error("Failed to persist debate record:", err);
  }

  return result;
}
