// Preservation Property Tests — these MUST PASS on unfixed code
// Passing confirms baseline behaviors that must be preserved after fixes.
// **Validates: Requirements 3.1, 3.2, 3.3, 3.6**
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { escapeRegExp } from "../../src/handlers/issueComment.js";
import { fetchConfig } from "../../src/utils/config.js";

// ══════════════════════════════════════════════════════════════════════════════
// Preservation A — escapeRegExp identity for safe strings
// Strings with no regex special chars should pass through unchanged.
// ══════════════════════════════════════════════════════════════════════════════

describe("Preservation A — escapeRegExp is identity for safe strings", () => {
  const SAFE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_".split("");

  it("property: strings without regex special chars return unchanged", () => {
    const safeStringArb = fc
      .array(fc.constantFrom(...SAFE_CHARS), { minLength: 0, maxLength: 50 })
      .map((chars) => chars.join(""));

    fc.assert(
      fc.property(safeStringArb, (s) => {
        expect(escapeRegExp(s)).toBe(s);
      }),
      { numRuns: 200 }
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Preservation B — fetchConfig with double-quoted values
// The current naive parser already handles double-quoted values correctly.
// ══════════════════════════════════════════════════════════════════════════════

describe("Preservation B — fetchConfig double-quoted values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("double-quoted gatingMode: \"hard_block\" returns hard_block", async () => {
    const yaml = [
      'gatingMode: "hard_block"',
      "flagsRequireReason: true",
      "maxDebateRounds: 3",
    ].join("\n");

    const context = {
      octokit: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: { content: Buffer.from(yaml).toString("base64") },
          }),
        },
      },
      payload: {
        repository: { owner: { login: "test-owner" }, name: "test-repo" },
      },
      log: { info: vi.fn(), warn: vi.fn() },
    } as any;

    const config = await fetchConfig(context);
    expect(config.gatingMode).toBe("hard_block");
    expect(config.flagsRequireReason).toBe(true);
    expect(config.maxDebateRounds).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Preservation C — fetchConfig default fallback on 404
// Missing config file must return DEFAULT_CONFIG.
// ══════════════════════════════════════════════════════════════════════════════

describe("Preservation C — fetchConfig default fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("missing config file returns advisory / true / 3", async () => {
    const context = {
      octokit: {
        repos: {
          getContent: vi.fn().mockRejectedValue(new Error("Not Found")),
        },
      },
      payload: {
        repository: { owner: { login: "test-owner" }, name: "test-repo" },
      },
      log: { info: vi.fn(), warn: vi.fn() },
    } as any;

    const config = await fetchConfig(context);
    expect(config).toEqual({
      gatingMode: "advisory",
      flagsRequireReason: true,
      maxDebateRounds: 3,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Preservation D — maxDebateRounds clamping
// Already covered by existing PBT in test/utils/config.test.ts (Property 13).
// We just verify it still passes by running that file — no duplication here.
// ══════════════════════════════════════════════════════════════════════════════
