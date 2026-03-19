// Feature: multi-model-debate-scoring, Property 13: Config validation clamps to valid range
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Mocks (hoisted so vi.mock factories can reference them) ──────────────────

const { mockOctokit, mockLog } = vi.hoisted(() => ({
  mockOctokit: {
    repos: {
      getContent: vi.fn(),
    },
  },
  mockLog: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// ── Import SUT after mocks ──────────────────────────────────────────────────

import { fetchConfig } from "../../src/utils/config.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(maxDebateRoundsValue: number) {
  const yamlContent = [
    'gatingMode: "advisory"',
    "flagsRequireReason: true",
    `maxDebateRounds: ${maxDebateRoundsValue}`,
  ].join("\n");

  const base64Content = Buffer.from(yamlContent).toString("base64");

  mockOctokit.repos.getContent.mockResolvedValue({
    data: { content: base64Content },
  });

  return {
    octokit: mockOctokit,
    payload: {
      repository: {
        owner: { login: "test-owner" },
        name: "test-repo",
      },
    },
    log: mockLog,
  } as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────

// Feature: multi-model-debate-scoring, Property 13: Config validation clamps to valid range
// **Validates: Requirements 8.3, 8.4**
describe("Property 13: Config validation clamps to valid range", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("for any integer, if in [2, 5] use as-is; otherwise resolved value should be 3", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100, max: 100 }), async (value) => {
        const context = makeContext(value);
        const config = await fetchConfig(context);

        if (value >= 2 && value <= 5) {
          expect(config.maxDebateRounds).toBe(value);
        } else {
          expect(config.maxDebateRounds).toBe(3);
        }
      }),
      { numRuns: 100 }
    );
  });
});
