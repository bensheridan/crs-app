import { prisma } from "./db.js";
import { ensureReviewerExists, trackOrgMetric } from "./reviewers.js";
import type { ClauseProposal } from "@prisma/client";

/**
 * Creates or increments a ClauseProposal. If a pending proposal with the same
 * title+repo exists, increments suggestion_count and appends the source PR.
 * If a rejected proposal with the same title+repo exists, skips creation.
 */
export async function upsertProposal(params: {
  title: string;
  description: string;
  reason: string;
  prNumber: number;
  repoOwner: string;
  repoName: string;
}): Promise<ClauseProposal | null> {
  try {
    const { title, description, reason, prNumber, repoOwner, repoName } = params;

    const existing = await prisma.clauseProposal.findUnique({
      where: {
        title_repo_owner_repo_name: {
          title,
          repo_owner: repoOwner,
          repo_name: repoName,
        },
      },
    });

    // If a rejected proposal exists, skip creation
    if (existing && existing.status === "rejected") {
      return null;
    }

    // If a pending proposal exists, increment suggestion_count and append PR
    if (existing && existing.status === "pending") {
      return await prisma.clauseProposal.update({
        where: { id: existing.id },
        data: {
          suggestion_count: { increment: 1 },
          source_prs: { push: prNumber },
        },
      });
    }

    // Otherwise create a new proposal
    return await prisma.clauseProposal.create({
      data: {
        title,
        description,
        reason,
        status: "pending",
        suggestion_count: 1,
        source_prs: [prNumber],
        repo_owner: repoOwner,
        repo_name: repoName,
      },
    });
  } catch (err) {
    // Re-throw so the caller (pullRequest.ts) can decide whether to log, skip,
    // or surface the failure — silently returning null here hid DB errors and
    // caused the comment to show /crs adopt buttons for unsaved proposals.
    throw err;
  }
}

/**
 * Finds a pending proposal by fuzzy title match within a repo.
 * Returns null if no match or ambiguous (multiple matches).
 */
export async function findPendingProposal(
  titleQuery: string,
  repoOwner: string,
  repoName: string
): Promise<ClauseProposal | null> {
  const matches = await prisma.clauseProposal.findMany({
    where: {
      status: "pending",
      repo_owner: repoOwner,
      repo_name: repoName,
      title: {
        contains: titleQuery,
        mode: "insensitive",
      },
    },
  });

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

/**
 * Lists all pending proposals for a repo.
 */
export async function listPendingProposals(
  repoOwner: string,
  repoName: string
): Promise<ClauseProposal[]> {
  return prisma.clauseProposal.findMany({
    where: {
      status: "pending",
      repo_owner: repoOwner,
      repo_name: repoName,
    },
  });
}

/**
 * Marks a proposal as adopted. Updates reviewer profile and org metrics.
 * Returns the updated proposal.
 */
export async function adoptProposal(
  proposalId: string,
  adoptedBy: string
): Promise<ClauseProposal> {
  const proposal = await prisma.clauseProposal.update({
    where: { id: proposalId },
    data: {
      status: "adopted",
      adopted_by: adoptedBy,
      resolved_at: new Date(),
    },
  });

  const reviewer = await ensureReviewerExists(adoptedBy);
  await prisma.reviewerProfile.update({
    where: { id: reviewer.id },
    data: {
      clauses_created: { increment: 1 },
      constitution_score: { increment: 25 },
    },
  });

  await trackOrgMetric("total_clauses_adopted");

  return proposal;
}

/**
 * Marks a proposal as rejected. Updates org metrics.
 * Returns the updated proposal.
 */
export async function rejectProposal(
  proposalId: string,
  rejectedBy: string
): Promise<ClauseProposal> {
  const proposal = await prisma.clauseProposal.update({
    where: { id: proposalId },
    data: {
      status: "rejected",
      rejected_by: rejectedBy,
      resolved_at: new Date(),
    },
  });

  await trackOrgMetric("total_clauses_rejected");

  return proposal;
}

/**
 * Reverts a proposal back to pending (used on constitution PR creation failure).
 * Clears adopted_by and resolved_at fields.
 */
export async function revertProposalToPending(
  proposalId: string
): Promise<void> {
  await prisma.clauseProposal.update({
    where: { id: proposalId },
    data: {
      status: "pending",
      adopted_by: null,
      resolved_at: null,
    },
  });
}

/**
 * Queries proposals with optional filters, ordered by suggestion_count descending.
 */
export async function queryProposals(params: {
  repoOwner?: string;
  repoName?: string;
  status?: "pending" | "adopted" | "rejected";
}): Promise<ClauseProposal[]> {
  const where: Record<string, string> = {};

  if (params.repoOwner) {
    where.repo_owner = params.repoOwner;
  }
  if (params.repoName) {
    where.repo_name = params.repoName;
  }
  if (params.status) {
    where.status = params.status;
  }

  return prisma.clauseProposal.findMany({
    where,
    orderBy: { suggestion_count: "desc" },
  });
}
