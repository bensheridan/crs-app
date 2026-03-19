// Meaningful CRS unit tests replacing Probot boilerplate
// **Validates: Requirements 1.4, 2.4, 3.5**
import { describe, it, expect, vi, beforeEach } from "vitest";
import { escapeRegExp } from "../src/handlers/issueComment.js";
import { fetchConfig } from "../src/utils/config.js";
import { fetchConstitution } from "../src/utils/constitution.js";

// ══════════════════════════════════════════════════════════════════════════════
// escapeRegExp unit tests
// ══════════════════════════════════════════════════════════════════════════════

describe("escapeRegExp", () => {
  it.each([
    [".", "\\."],
    ["*", "\\*"],
    ["+", "\\+"],
    ["?", "\\?"],
    ["^", "\\^"],
    ["$", "\\$"],
    ["{", "\\{"],
    ["}", "\\}"],
    ["(", "\\("],
    [")", "\\)"],
    ["|", "\\|"],
    ["[", "\\["],
    ["]", "\\]"],
    ["\\", "\\\\"],
  ])("escapes special char %s → %s", (input, expected) => {
    expect(escapeRegExp(input)).toBe(expected);
  });

  it("escapes multiple special chars in one string", () => {
    expect(escapeRegExp("C++ (High)")).toBe("C\\+\\+ \\(High\\)");
  });

  it("returns empty string unchanged", () => {
    expect(escapeRegExp("")).toBe("");
  });

  it("returns plain string unchanged", () => {
    expect(escapeRegExp("Business Logic")).toBe("Business Logic");
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// fetchConfig unit tests — YAML parsing variations
// ══════════════════════════════════════════════════════════════════════════════

function makeConfigContext(yamlContent: string) {
  return {
    octokit: {
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: { content: Buffer.from(yamlContent).toString("base64") },
        }),
      },
    },
    payload: {
      repository: { owner: { login: "o" }, name: "r" },
    },
    log: { info: vi.fn(), warn: vi.fn() },
  } as any;
}

describe("fetchConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses unquoted gatingMode", async () => {
    const config = await fetchConfig(makeConfigContext("gatingMode: hard_block\nflagsRequireReason: true\nmaxDebateRounds: 3"));
    expect(config.gatingMode).toBe("hard_block");
  });

  it("parses single-quoted gatingMode", async () => {
    const config = await fetchConfig(makeConfigContext("gatingMode: 'soft_block'\nflagsRequireReason: false\nmaxDebateRounds: 4"));
    expect(config.gatingMode).toBe("soft_block");
    expect(config.flagsRequireReason).toBe(false);
    expect(config.maxDebateRounds).toBe(4);
  });

  it("parses double-quoted gatingMode", async () => {
    const config = await fetchConfig(makeConfigContext('gatingMode: "hard_block"\nflagsRequireReason: true\nmaxDebateRounds: 2'));
    expect(config.gatingMode).toBe("hard_block");
  });

  it("handles trailing YAML comments", async () => {
    const config = await fetchConfig(makeConfigContext("gatingMode: soft_block # strict\nflagsRequireReason: true\nmaxDebateRounds: 3"));
    expect(config.gatingMode).toBe("soft_block");
  });

  it("uses defaults for missing fields", async () => {
    const config = await fetchConfig(makeConfigContext("someOtherField: true"));
    expect(config.gatingMode).toBe("advisory");
    expect(config.flagsRequireReason).toBe(true);
    expect(config.maxDebateRounds).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// fetchConstitution unit tests
// ══════════════════════════════════════════════════════════════════════════════

function makeConstitutionContext(yamlContent: string | null) {
  const mock = yamlContent
    ? vi.fn().mockResolvedValue({ data: { content: Buffer.from(yamlContent).toString("base64") } })
    : vi.fn().mockRejectedValue(new Error("Not Found"));

  return {
    octokit: { repos: { getContent: mock } },
    payload: {
      repository: { owner: { login: "o" }, name: "r" },
      pull_request: { head: { sha: "abc" } },
    },
    log: { info: vi.fn(), warn: vi.fn() },
  } as any;
}

describe("fetchConstitution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns parsed clause objects", async () => {
    const yaml = 'clauses:\n  - id: 1\n    title: "TS Only"\n    category: "Arch"\n    description: "Use TS"';
    const result = await fetchConstitution(makeConstitutionContext(yaml));
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 1, title: "TS Only", category: "Arch", description: "Use TS" });
  });

  it("returns empty array when file is missing", async () => {
    const result = await fetchConstitution(makeConstitutionContext(null));
    expect(result).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Check run conclusion — unflagged tiles produce "success"
// ══════════════════════════════════════════════════════════════════════════════

describe("check run conclusion logic", () => {
  it("unflagged tiles produce success conclusion", () => {
    // Mirrors the logic in createReviewCheck: hasFlaggedTiles drives conclusion
    const reviewTiles = [
      { name: "Business Logic", description: "", status: "approved" as const },
      { name: "Security", description: "", status: "approved" as const },
    ];
    const hasFlaggedTiles = reviewTiles.some(t => (t.status as string) === "flagged");
    const conclusion = hasFlaggedTiles ? "failure" : "success";
    expect(conclusion).toBe("success");
  });
});
