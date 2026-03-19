import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Mocks (hoisted so vi.mock factories can reference them) ──────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    clause: { findMany: vi.fn() },
    violation: { findMany: vi.fn() },
    reviewerProfile: { findMany: vi.fn() },
    metric: { findMany: vi.fn() },
    clauseProposal: { findMany: vi.fn() },
    debateRecord: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../src/services/proposalService.js", () => ({
  queryProposals: vi.fn(),
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
function mockReq(overrides: Record<string, any> = {}): any {
  return { query: {}, params: {}, ...overrides };
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

/** Build a fake DebateRecord for testing */
function makeDebateRecord(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: overrides.id ?? "uuid-1",
    pr_number: overrides.pr_number ?? 1,
    repo_owner: overrides.repo_owner ?? "owner",
    repo_name: overrides.repo_name ?? "repo",
    debate_confidence: overrides.debate_confidence ?? 50,
    confidence_label: overrides.confidence_label ?? "moderate",
    total_rounds: overrides.total_rounds ?? 3,
    max_rounds: overrides.max_rounds ?? 3,
    terminated_early: overrides.terminated_early ?? false,
    transcript: overrides.transcript ?? "transcript text",
    created_at: overrides.created_at ?? new Date("2025-01-15T10:00:00Z"),
  };
}


// ── Property Tests ───────────────────────────────────────────────────────────

// Feature: multi-model-debate-scoring, Property 11: API debates ordered by creation date descending
describe("Property 11: API debates ordered by creation date descending", () => {
  // **Validates: Requirements 7.1**
  it("returns debates sorted by created_at descending", async () => {
    const router = getApiRouter();
    const handler = getRouteHandler(router, "get", "/debates");

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.integer({
            min: new Date("2020-01-01").getTime(),
            max: new Date("2030-01-01").getTime(),
          }).map((ts) => new Date(ts)),
          { minLength: 2, maxLength: 10 }
        ),
        async (dates) => {
          // Build records with the generated dates, sorted desc (simulating Prisma orderBy)
          const sortedDates = [...dates].sort(
            (a, b) => b.getTime() - a.getTime()
          );
          const records = sortedDates.map((d, i) =>
            makeDebateRecord({
              id: `uuid-${i}`,
              created_at: d,
              debate_confidence: 50,
            })
          );

          mockPrisma.debateRecord.findMany.mockResolvedValue(records);

          const req = mockReq();
          const res = mockRes();
          await handler(req, res);

          const body = res.body as any[];
          expect(body.length).toBe(records.length);

          // Verify descending order
          for (let i = 1; i < body.length; i++) {
            const prev = new Date(body[i - 1].created_at).getTime();
            const curr = new Date(body[i].created_at).getTime();
            expect(prev).toBeGreaterThanOrEqual(curr);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: multi-model-debate-scoring, Property 12: API metrics accuracy
describe("Property 12: API metrics accuracy", () => {
  // **Validates: Requirements 7.3**
  it("averageConfidence equals rounded mean and totalDebates equals count", async () => {
    const router = getApiRouter();
    const handler = getRouteHandler(router, "get", "/debates/metrics");

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 100 }), {
          minLength: 1,
          maxLength: 20,
        }),
        async (confidences) => {
          const records = confidences.map((c) => ({ debate_confidence: c }));
          mockPrisma.debateRecord.findMany.mockResolvedValue(records);

          const req = mockReq();
          const res = mockRes();
          await handler(req, res);

          const expectedTotal = confidences.length;
          const expectedAvg = Math.round(
            confidences.reduce((s, v) => s + v, 0) / confidences.length
          );

          expect(res.body.totalDebates).toBe(expectedTotal);
          expect(res.body.averageConfidence).toBe(expectedAvg);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ── Unit Tests ───────────────────────────────────────────────────────────────

describe("GET /api/debates/:id", () => {
  let handler: (req: any, res: any) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    const router = getApiRouter();
    handler = getRouteHandler(router, "get", "/debates/:id");
  });

  it("returns 404 for non-existent debate ID", async () => {
    mockPrisma.debateRecord.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: "non-existent-id" } });
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual(
      expect.objectContaining({ error: "Debate not found" })
    );
  });

  it("returns 500 when Prisma throws", async () => {
    mockPrisma.debateRecord.findUnique.mockRejectedValue(
      new Error("DB connection lost")
    );

    const req = mockReq({ params: { id: "some-id" } });
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual(
      expect.objectContaining({ error: "Failed to fetch debate" })
    );
  });
});

describe("GET /api/debates", () => {
  let handler: (req: any, res: any) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    const router = getApiRouter();
    handler = getRouteHandler(router, "get", "/debates");
  });

  it("returns empty list when no debates exist", async () => {
    mockPrisma.debateRecord.findMany.mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.body).toEqual([]);
  });

  it("returns 500 when Prisma throws", async () => {
    mockPrisma.debateRecord.findMany.mockRejectedValue(
      new Error("DB connection lost")
    );

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual(
      expect.objectContaining({ error: "Failed to fetch debates" })
    );
  });
});

describe("GET /api/debates/metrics", () => {
  let handler: (req: any, res: any) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    const router = getApiRouter();
    handler = getRouteHandler(router, "get", "/debates/metrics");
  });

  it("returns zero metrics when no debates exist", async () => {
    mockPrisma.debateRecord.findMany.mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.body).toEqual({ averageConfidence: 0, totalDebates: 0 });
  });

  it("returns 500 when Prisma throws", async () => {
    mockPrisma.debateRecord.findMany.mockRejectedValue(
      new Error("DB connection lost")
    );

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual(
      expect.objectContaining({ error: "Failed to fetch debate metrics" })
    );
  });
});
