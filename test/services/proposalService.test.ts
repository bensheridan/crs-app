// Feature: constitution-auto-evolution, Properties 1–5, 8
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Mocks (hoisted so vi.mock factories can reference them) ──────────────────

const { mockPrisma, mockEnsureReviewerExists, mockTrackOrgMetric } = vi.hoisted(() => ({
  mockPrisma: {
    clauseProposal: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    reviewerProfile: {
      update: vi.fn(),
    },
  },
  mockEnsureReviewerExists: vi.fn(),
  mockTrackOrgMetric: vi.fn(),
}));

vi.mock("../../src/services/db.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../src/services/reviewers.js", () => ({
  ensureReviewerExists: (...args: unknown[]) => mockEnsureReviewerExists(...args),
  trackOrgMetric: (...args: unknown[]) => mockTrackOrgMetric(...args),
}));

// ── Import SUT after mocks ──────────────────────────────────────────────────

import {
  upsertProposal,
  adoptProposal,
  rejectProposal,
  queryProposals,
} from "../../src/services/proposalService.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Arbitrary for non-empty trimmed strings (titles, descriptions, etc.) */
const nonEmptyStr = () =>
  fc.string({ minLength: 1, maxLength: 80 }).map((s) => s.trim() || "a");

/** Arbitrary for a valid upsert params object */
const upsertParamsArb = () =>
  fc.record({
    title: nonEmptyStr(),
    description: nonEmptyStr(),
    reason: nonEmptyStr(),
    prNumber: fc.nat({ max: 999999 }),
    repoOwner: nonEmptyStr(),
    repoName: nonEmptyStr(),
  });

// ── Tests ────────────────────────────────────────────────────────────────────

describe("proposalService property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Property 1: Proposal upsert creates valid records ────────────────────
  // Feature: constitution-auto-evolution, Property 1: Proposal upsert creates valid records
  // **Validates: Requirements 1.1, 1.2**
  describe("Property 1: Proposal upsert creates valid records", () => {
    it("for any valid clause and repo context, upsertProposal produces a record with correct fields", async () => {
      await fc.assert(
        fc.asyncProperty(upsertParamsArb(), async (params) => {
          // No existing proposal
          mockPrisma.clauseProposal.findUnique.mockResolvedValue(null);

          const created = {
            id: "uuid-1",
            title: params.title,
            description: params.description,
            reason: params.reason,
            status: "pending",
            suggestion_count: 1,
            source_prs: [params.prNumber],
            repo_owner: params.repoOwner,
            repo_name: params.repoName,
            adopted_by: null,
            rejected_by: null,
            resolved_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          };
          mockPrisma.clauseProposal.create.mockResolvedValue(created);

          const result = await upsertProposal(params);

          expect(result).not.toBeNull();
          expect(result!.status).toBe("pending");
          expect(result!.suggestion_count).toBeGreaterThanOrEqual(1);
          expect(result!.title).toBe(params.title);
          expect(result!.description).toBe(params.description);
          expect(result!.reason).toBe(params.reason);
          expect(result!.source_prs).toContain(params.prNumber);
          expect(result!.repo_owner).toBe(params.repoOwner);
          expect(result!.repo_name).toBe(params.repoName);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 2: Proposal upsert deduplication ────────────────────────────
  // Feature: constitution-auto-evolution, Property 2: Proposal upsert deduplication
  // **Validates: Requirements 1.3, 1.4, 5.1, 5.2, 6.2**
  describe("Property 2: Proposal upsert deduplication", () => {
    it("for N upserts with same title+repo, exactly one record exists with suggestion_count = N and all PR numbers", async () => {
      await fc.assert(
        fc.asyncProperty(
          nonEmptyStr(),
          nonEmptyStr(),
          nonEmptyStr(),
          nonEmptyStr(),
          fc.array(fc.nat({ max: 999999 }), { minLength: 1, maxLength: 10 }),
          async (title, repoOwner, repoName, reason, prNumbers) => {
            // In-memory store to simulate DB state
            let stored: {
              id: string;
              title: string;
              description: string;
              reason: string;
              status: string;
              suggestion_count: number;
              source_prs: number[];
              repo_owner: string;
              repo_name: string;
              adopted_by: string | null;
              rejected_by: string | null;
              resolved_at: Date | null;
              created_at: Date;
              updated_at: Date;
            } | null = null;

            mockPrisma.clauseProposal.findUnique.mockImplementation(async () => stored);

            mockPrisma.clauseProposal.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
              stored = {
                id: "uuid-dedup",
                title: data.title as string,
                description: data.description as string,
                reason: data.reason as string,
                status: data.status as string,
                suggestion_count: data.suggestion_count as number,
                source_prs: data.source_prs as number[],
                repo_owner: data.repo_owner as string,
                repo_name: data.repo_name as string,
                adopted_by: null,
                rejected_by: null,
                resolved_at: null,
                created_at: new Date(),
                updated_at: new Date(),
              };
              return stored;
            });

            mockPrisma.clauseProposal.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
              if (stored) {
                if (data.suggestion_count && typeof data.suggestion_count === "object" && "increment" in data.suggestion_count) {
                  stored.suggestion_count += (data.suggestion_count as { increment: number }).increment;
                }
                if (data.source_prs && typeof data.source_prs === "object" && "push" in data.source_prs) {
                  stored.source_prs.push((data.source_prs as { push: number }).push);
                }
                stored.updated_at = new Date();
              }
              return stored;
            });

            // Perform N upserts
            for (const prNumber of prNumbers) {
              await upsertProposal({
                title,
                description: "desc",
                reason,
                prNumber,
                repoOwner,
                repoName,
              });
            }

            // Verify: exactly one record with correct counts
            expect(stored).not.toBeNull();
            expect(stored!.suggestion_count).toBe(prNumbers.length);
            // All PR numbers should be in source_prs
            for (const pr of prNumbers) {
              expect(stored!.source_prs).toContain(pr);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 3: Rejected proposals block re-creation ─────────────────────
  // Feature: constitution-auto-evolution, Property 3: Rejected proposals block re-creation
  // **Validates: Requirements 3.4**
  describe("Property 3: Rejected proposals block re-creation", () => {
    it("upsertProposal on a rejected title+repo returns null and does not create/modify records", async () => {
      await fc.assert(
        fc.asyncProperty(upsertParamsArb(), async (params) => {
          // Simulate an existing rejected proposal
          const rejected = {
            id: "uuid-rejected",
            title: params.title,
            description: "old desc",
            reason: "old reason",
            status: "rejected",
            suggestion_count: 1,
            source_prs: [42],
            repo_owner: params.repoOwner,
            repo_name: params.repoName,
            adopted_by: null,
            rejected_by: "someuser",
            resolved_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          };
          mockPrisma.clauseProposal.findUnique.mockResolvedValue(rejected);

          const result = await upsertProposal(params);

          expect(result).toBeNull();
          // create and update should NOT have been called
          expect(mockPrisma.clauseProposal.create).not.toHaveBeenCalled();
          expect(mockPrisma.clauseProposal.update).not.toHaveBeenCalled();
        }),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 4: Adoption state transition and side effects ───────────────
  // Feature: constitution-auto-evolution, Property 4: Adoption state transition and side effects
  // **Validates: Requirements 2.1, 2.2, 2.5, 5.3**
  describe("Property 4: Adoption state transition and side effects", () => {
    it("adoptProposal transitions to adopted, sets adopted_by, resolved_at, increments reviewer score and metric", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          nonEmptyStr(),
          async (proposalId, adoptedBy) => {
            const updatedProposal = {
              id: proposalId,
              title: "some title",
              description: "desc",
              reason: "reason",
              status: "adopted",
              suggestion_count: 1,
              source_prs: [1],
              repo_owner: "owner",
              repo_name: "repo",
              adopted_by: adoptedBy,
              rejected_by: null,
              resolved_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            };

            mockPrisma.clauseProposal.update.mockResolvedValue(updatedProposal);

            const reviewerProfile = {
              id: "reviewer-uuid",
              github_id: adoptedBy,
              constitution_score: 0,
              regression_score: 0,
              clauses_created: 0,
              total_reviews: 0,
              agreed_with_ai: 0,
              overrode_ai: 0,
            };
            mockEnsureReviewerExists.mockResolvedValue(reviewerProfile);
            mockPrisma.reviewerProfile.update.mockResolvedValue(reviewerProfile);
            mockTrackOrgMetric.mockResolvedValue(undefined);

            const result = await adoptProposal(proposalId, adoptedBy);

            // Status transitioned to adopted
            expect(result.status).toBe("adopted");
            expect(result.adopted_by).toBe(adoptedBy);
            expect(result.resolved_at).not.toBeNull();

            // Prisma update was called with correct data
            expect(mockPrisma.clauseProposal.update).toHaveBeenCalledWith(
              expect.objectContaining({
                where: { id: proposalId },
                data: expect.objectContaining({
                  status: "adopted",
                  adopted_by: adoptedBy,
                }),
              })
            );

            // Reviewer score incremented by 25, clauses_created by 1
            expect(mockPrisma.reviewerProfile.update).toHaveBeenCalledWith(
              expect.objectContaining({
                data: expect.objectContaining({
                  clauses_created: { increment: 1 },
                  constitution_score: { increment: 25 },
                }),
              })
            );

            // Org metric tracked
            expect(mockTrackOrgMetric).toHaveBeenCalledWith("total_clauses_adopted");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 5: Rejection state transition and side effects ──────────────
  // Feature: constitution-auto-evolution, Property 5: Rejection state transition and side effects
  // **Validates: Requirements 3.1, 3.2, 5.4**
  describe("Property 5: Rejection state transition and side effects", () => {
    it("rejectProposal transitions to rejected, sets rejected_by, resolved_at, increments total_clauses_rejected metric", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          nonEmptyStr(),
          async (proposalId, rejectedBy) => {
            const updatedProposal = {
              id: proposalId,
              title: "some title",
              description: "desc",
              reason: "reason",
              status: "rejected",
              suggestion_count: 1,
              source_prs: [1],
              repo_owner: "owner",
              repo_name: "repo",
              adopted_by: null,
              rejected_by: rejectedBy,
              resolved_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            };

            mockPrisma.clauseProposal.update.mockResolvedValue(updatedProposal);
            mockTrackOrgMetric.mockResolvedValue(undefined);

            const result = await rejectProposal(proposalId, rejectedBy);

            // Status transitioned to rejected
            expect(result.status).toBe("rejected");
            expect(result.rejected_by).toBe(rejectedBy);
            expect(result.resolved_at).not.toBeNull();

            // Prisma update was called with correct data
            expect(mockPrisma.clauseProposal.update).toHaveBeenCalledWith(
              expect.objectContaining({
                where: { id: proposalId },
                data: expect.objectContaining({
                  status: "rejected",
                  rejected_by: rejectedBy,
                }),
              })
            );

            // Org metric tracked
            expect(mockTrackOrgMetric).toHaveBeenCalledWith("total_clauses_rejected");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 8: Proposal query filtering by status ───────────────────────
  // Feature: constitution-auto-evolution, Property 8: Proposal query filtering by status
  // **Validates: Requirements 5.5, 7.1, 7.2**
  describe("Property 8: Proposal query filtering by status", () => {
    it("querying with a status filter returns only matching proposals; without filter returns all ordered by suggestion_count desc", async () => {
      const statusArb = fc.constantFrom("pending" as const, "adopted" as const, "rejected" as const);

      // Generate a list of proposals with mixed statuses
      const proposalArb = fc.record({
        id: fc.uuid(),
        title: nonEmptyStr(),
        description: nonEmptyStr(),
        reason: nonEmptyStr(),
        status: statusArb,
        suggestion_count: fc.integer({ min: 1, max: 100 }),
        source_prs: fc.array(fc.nat({ max: 999999 }), { minLength: 1, maxLength: 5 }),
        repo_owner: fc.constant("owner"),
        repo_name: fc.constant("repo"),
        adopted_by: fc.constant(null),
        rejected_by: fc.constant(null),
        resolved_at: fc.constant(null),
        created_at: fc.constant(new Date()),
        updated_at: fc.constant(new Date()),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(proposalArb, { minLength: 1, maxLength: 15 }),
          fc.option(statusArb, { nil: undefined }),
          async (proposals, filterStatus) => {
            // Compute expected results
            let expected = filterStatus
              ? proposals.filter((p) => p.status === filterStatus)
              : proposals;
            // Sort by suggestion_count desc
            expected = [...expected].sort((a, b) => b.suggestion_count - a.suggestion_count);

            // Mock findMany to simulate filtering and ordering
            mockPrisma.clauseProposal.findMany.mockImplementation(
              async ({ where, orderBy }: { where?: Record<string, string>; orderBy?: Record<string, string> }) => {
                let result = [...proposals];
                if (where?.status) {
                  result = result.filter((p) => p.status === where.status);
                }
                if (where?.repo_owner) {
                  result = result.filter((p) => p.repo_owner === where.repo_owner);
                }
                if (where?.repo_name) {
                  result = result.filter((p) => p.repo_name === where.repo_name);
                }
                if (orderBy?.suggestion_count === "desc") {
                  result.sort((a, b) => b.suggestion_count - a.suggestion_count);
                }
                return result;
              }
            );

            const result = await queryProposals({
              repoOwner: "owner",
              repoName: "repo",
              status: filterStatus,
            });

            // All returned proposals should match the filter
            if (filterStatus) {
              for (const p of result) {
                expect(p.status).toBe(filterStatus);
              }
            }

            // Count should match expected
            expect(result.length).toBe(expected.length);

            // Should be ordered by suggestion_count desc
            for (let i = 1; i < result.length; i++) {
              expect(result[i - 1].suggestion_count).toBeGreaterThanOrEqual(
                result[i].suggestion_count
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
