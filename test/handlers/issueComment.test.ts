import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockFindPendingProposal,
  mockListPendingProposals,
  mockAdoptProposal,
  mockRejectProposal,
  mockRevertProposalToPending,
  mockCreateConstitutionPR,
  mockFetchConfig,
  mockCreateReviewCheck,
  mockTrackReviewerAction,
} = vi.hoisted(() => ({
  mockFindPendingProposal: vi.fn(),
  mockListPendingProposals: vi.fn(),
  mockAdoptProposal: vi.fn(),
  mockRejectProposal: vi.fn(),
  mockRevertProposalToPending: vi.fn(),
  mockCreateConstitutionPR: vi.fn(),
  mockFetchConfig: vi.fn(),
  mockCreateReviewCheck: vi.fn(),
  mockTrackReviewerAction: vi.fn(),
}));

vi.mock("../../src/services/proposalService.js", () => ({
  findPendingProposal: mockFindPendingProposal,
  listPendingProposals: mockListPendingProposals,
  adoptProposal: mockAdoptProposal,
  rejectProposal: mockRejectProposal,
  revertProposalToPending: mockRevertProposalToPending,
}));

vi.mock("../../src/services/constitutionWriter.js", () => ({
  createConstitutionPR: mockCreateConstitutionPR,
}));

vi.mock("../../src/utils/config.js", () => ({
  fetchConfig: mockFetchConfig,
}));

vi.mock("../../src/handlers/checkRun.js", () => ({
  createReviewCheck: mockCreateReviewCheck,
}));

vi.mock("../../src/services/reviewers.js", () => ({
  trackReviewerAction: mockTrackReviewerAction,
}));

// ── Import SUT after mocks ──────────────────────────────────────────────────

import { handleIssueComment } from "../../src/handlers/issueComment.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockContext(commentBody: string) {
  return {
    payload: {
      comment: {
        body: commentBody,
        user: { login: "testuser", type: "User" },
        id: 12345,
      },
      issue: {
        number: 42,
        pull_request: {},
      },
      repository: {
        owner: { login: "test-owner" },
        name: "test-repo",
        default_branch: "main",
      },
    },
    octokit: {
      issues: {
        createComment: vi.fn().mockResolvedValue({}),
        listComments: vi.fn().mockResolvedValue({ data: [] }),
        updateComment: vi.fn().mockResolvedValue({}),
      },
      reactions: {
        createForIssueComment: vi.fn().mockResolvedValue({}),
      },
    },
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
}

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal-uuid-1",
    title: "Automated Secret Scanning",
    description: "Require a pre-commit hook that scans for common password and key formats.",
    reason: "Multiple PRs contained hardcoded secrets.",
    status: "pending",
    suggestion_count: 2,
    source_prs: [10, 15],
    repo_owner: "test-owner",
    repo_name: "test-repo",
    adopted_by: null,
    rejected_by: null,
    resolved_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
// **Validates: Requirements 2.1, 2.6, 2.7, 3.1, 3.5**

describe("issueComment handler — adopt/reject slash commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: adopt with multi-word title calls findPendingProposal with full title
  it("adopt with multi-word title calls findPendingProposal with full title", async () => {
    const context = createMockContext("/crs adopt Automated Secret Scanning");
    mockFindPendingProposal.mockResolvedValue(makeProposal());
    mockAdoptProposal.mockResolvedValue(makeProposal({ status: "adopted", adopted_by: "testuser" }));
    mockCreateConstitutionPR.mockResolvedValue("https://github.com/test-owner/test-repo/pull/99");

    await handleIssueComment(context as any);

    expect(mockFindPendingProposal).toHaveBeenCalledWith(
      "Automated Secret Scanning",
      "test-owner",
      "test-repo"
    );
  });

  // Test 2: adopt with matching proposal calls adoptProposal and createConstitutionPR
  it("adopt with matching proposal calls adoptProposal and createConstitutionPR", async () => {
    const proposal = makeProposal();
    const context = createMockContext("/crs adopt Automated Secret Scanning");
    mockFindPendingProposal.mockResolvedValue(proposal);
    mockAdoptProposal.mockResolvedValue(makeProposal({ status: "adopted", adopted_by: "testuser" }));
    mockCreateConstitutionPR.mockResolvedValue("https://github.com/test-owner/test-repo/pull/99");

    await handleIssueComment(context as any);

    expect(mockAdoptProposal).toHaveBeenCalledWith("proposal-uuid-1", "testuser");
    expect(mockCreateConstitutionPR).toHaveBeenCalledWith(
      expect.objectContaining({
        repoOwner: "test-owner",
        repoName: "test-repo",
        defaultBranch: "main",
        clause: { title: proposal.title, description: proposal.description },
        sourcePrNumber: 10,
        reason: proposal.reason,
      })
    );
    // Confirmation comment posted
    expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("Clause adopted"),
      })
    );
  });

  // Test 3: adopt with no matching proposal posts error with available proposals
  it("adopt with no matching proposal posts error with available proposals", async () => {
    const context = createMockContext("/crs adopt Nonexistent Clause");
    mockFindPendingProposal.mockResolvedValue(null);
    mockListPendingProposals.mockResolvedValue([
      makeProposal({ title: "Automated Secret Scanning" }),
      makeProposal({ id: "proposal-uuid-2", title: "Enforce Code Coverage" }),
    ]);

    await handleIssueComment(context as any);

    expect(mockListPendingProposals).toHaveBeenCalledWith("test-owner", "test-repo");
    // Error comment should list available proposals
    expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Automated Secret Scanning"),
      })
    );
    expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Enforce Code Coverage"),
      })
    );
  });

  // Test 4: adopt reverts proposal when createConstitutionPR fails
  it("adopt reverts proposal when createConstitutionPR fails", async () => {
    const proposal = makeProposal();
    const context = createMockContext("/crs adopt Automated Secret Scanning");
    mockFindPendingProposal.mockResolvedValue(proposal);
    mockAdoptProposal.mockResolvedValue(makeProposal({ status: "adopted" }));
    mockCreateConstitutionPR.mockRejectedValue(new Error("GitHub API failure"));
    mockRevertProposalToPending.mockResolvedValue(undefined);

    await handleIssueComment(context as any);

    expect(mockRevertProposalToPending).toHaveBeenCalledWith("proposal-uuid-1");
    // Error comment posted
    expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Failed to create the constitution PR"),
      })
    );
  });

  // Test 5: reject with matching proposal calls rejectProposal
  it("reject with matching proposal calls rejectProposal and posts confirmation", async () => {
    const proposal = makeProposal();
    const context = createMockContext("/crs reject Automated Secret Scanning");
    mockFindPendingProposal.mockResolvedValue(proposal);
    mockRejectProposal.mockResolvedValue(makeProposal({ status: "rejected", rejected_by: "testuser" }));

    await handleIssueComment(context as any);

    expect(mockFindPendingProposal).toHaveBeenCalledWith(
      "Automated Secret Scanning",
      "test-owner",
      "test-repo"
    );
    expect(mockRejectProposal).toHaveBeenCalledWith("proposal-uuid-1", "testuser");
    // Confirmation comment posted
    expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Clause rejected"),
      })
    );
  });

  // Test 6: reject with no matching proposal posts error
  it("reject with no matching proposal posts error with available proposals", async () => {
    const context = createMockContext("/crs reject Nonexistent Clause");
    mockFindPendingProposal.mockResolvedValue(null);
    mockListPendingProposals.mockResolvedValue([
      makeProposal({ title: "Automated Secret Scanning" }),
    ]);

    await handleIssueComment(context as any);

    expect(mockListPendingProposals).toHaveBeenCalledWith("test-owner", "test-repo");
    expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("No pending proposal matching"),
      })
    );
    expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Automated Secret Scanning"),
      })
    );
  });
});
