import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted so vi.mock factories can reference them) ──────────────────

const { mockQueryProposals, mockPrisma } = vi.hoisted(() => ({
  mockQueryProposals: vi.fn(),
  mockPrisma: {
    clause: { findMany: vi.fn() },
    violation: { findMany: vi.fn() },
    reviewerProfile: { findMany: vi.fn() },
    metric: { findMany: vi.fn() },
    clauseProposal: { findMany: vi.fn() },
  },
}));

vi.mock("../../src/services/proposalService.js", () => ({
  queryProposals: mockQueryProposals,
}));

vi.mock("../../src/services/db.js", () => ({
  prisma: mockPrisma,
}));

// ── Import SUT after mocks ──────────────────────────────────────────────────

import { getApiRouter } from "../../src/api/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a route handler from an Express router by method + path */
function getRouteHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method]
  );
  return layer?.route?.stack[0]?.handle;
}

/** Create a mock Express request object */
function mockReq(query: Record<string, string> = {}): any {
  return { query };
}

/** Create a mock Express response object with chainable status() */
function mockRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined,
    json: vi.fn((data: unknown) => {
      res.body = data;
      return res;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
  };
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/proposals", () => {
  let handler: (req: any, res: any) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    const router = getApiRouter();
    handler = getRouteHandler(router, "get", "/proposals");
  });

  // **Validates: Requirements 7.1, 7.2**
  it("returns proposals array from queryProposals", async () => {
    const sampleProposals = [
      {
        id: "uuid-1",
        title: "Enforce linting",
        description: "All PRs must pass lint",
        reason: "Consistency",
        status: "pending",
        suggestion_count: 5,
        source_prs: [10, 20],
        repo_owner: "owner",
        repo_name: "repo",
      },
      {
        id: "uuid-2",
        title: "Require tests",
        description: "All PRs must include tests",
        reason: "Quality",
        status: "pending",
        suggestion_count: 3,
        source_prs: [15],
        repo_owner: "owner",
        repo_name: "repo",
      },
    ];
    mockQueryProposals.mockResolvedValue(sampleProposals);

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(sampleProposals);
    expect(mockQueryProposals).toHaveBeenCalledWith({ status: undefined });
  });

  // **Validates: Requirements 7.2**
  it("passes status=pending filter to queryProposals", async () => {
    mockQueryProposals.mockResolvedValue([]);

    const req = mockReq({ status: "pending" });
    const res = mockRes();
    await handler(req, res);

    expect(mockQueryProposals).toHaveBeenCalledWith({ status: "pending" });
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("returns 400 for invalid status filter", async () => {
    const req = mockReq({ status: "invalid" });
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(
      expect.objectContaining({ error: expect.stringContaining("Invalid status") })
    );
    expect(mockQueryProposals).not.toHaveBeenCalled();
  });

  it("returns 500 when queryProposals throws", async () => {
    mockQueryProposals.mockRejectedValue(new Error("DB connection lost"));

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual(
      expect.objectContaining({ error: "Failed to fetch proposals" })
    );
  });
});
