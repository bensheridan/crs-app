export interface RoundScoringInput {
  constitutionalReferences: string[];
  evidenceCitations: string[];
  coherenceRating: number;
}

export function scoreRound(input: RoundScoringInput): number {
  const refScore = Math.min(input.constitutionalReferences.length * 25, 100);
  const evidenceScore = Math.min(input.evidenceCitations.length * 20, 100);
  return Math.round((refScore + evidenceScore + input.coherenceRating) / 3);
}

export function computeDebateConfidence(roundScores: number[]): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < roundScores.length; i++) {
    const weight = i + 1;
    weightedSum += roundScores[i] * weight;
    weightTotal += weight;
  }
  return Math.round(weightedSum / weightTotal);
}

export function getStrengthLabel(score: number): "weak" | "strong" {
  return score < 50 ? "weak" : "strong";
}

export function getConfidenceLabel(confidence: number): "high" | "moderate" | "low" {
  if (confidence >= 70) return "high";
  if (confidence >= 40) return "moderate";
  return "low";
}
