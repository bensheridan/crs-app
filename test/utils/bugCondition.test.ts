// Bug Condition Exploration Tests — these MUST FAIL on unfixed code
// Failure confirms the bugs exist. DO NOT fix the bugs.
// **Validates: Requirements 1.1, 1.2, 1.3**
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { escapeRegExp } from "../../src/handlers/issueComment.js";
import { fetchConfig } from "../../src/utils/config.js";
import { fetchConstitution } from "../../src/utils/constitution.js";

// ══════════════════════════════════════════════════════════════════════════════
// Bug 1 — escapeRegExp UUID replacement
// ══════════════════════════════════════════════════════════════════════════════

describe("Bug 1 — escapeRegExp produces valid escaped output", () => {
  const SPECIAL_CHARS = [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"];

  it("property: escaped string used as RegExp matches the original input literally", () => {
    // Generate strings that contain at least one regex special char mixed with safe chars
    const specialCharArb = fc.constantFrom(...SPECIAL_CHARS);
    const safeCharArb = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 ".split(""));

    // Build strings that always include at least one special char
    const inputArb = fc
      .tuple(
        fc.array(safeCharArb, { minLength: 1, maxLength: 5 }),
        specialCharArb,
        fc.array(safeCharArb, { minLength: 0, maxLength: 5 })
      )
      .map(([prefix, required, suffix]) => [...prefix, required, ...suffix].join(""));

    fc.assert(
      fc.property(inputArb, (input) => {
        const escaped = escapeRegExp(input);

        // The escaped string must create a valid RegExp that matches the original input exactly
        const regex = new RegExp(`^${escaped}$`);
        expect(regex.test(input)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// Bug 2 — fetchConfig naive YAML parsing
// ══════════════════════════════════════════════════════════════════════════════

describe("Bug 2 — fetchConfig parses unquoted YAML values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unquoted gatingMode: hard_block should return hard_block, not advisory", async () => {
    const yaml = [
      "gatingMode: hard_block",
      "flagsRequireReason: true",
      "maxDebateRounds: 3",
    ].join("\n");

    const base64Content = Buffer.from(yaml).toString("base64");

    const context = {
      octokit: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: { content: base64Content },
          }),
        },
      },
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
      },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    } as any;

    const config = await fetchConfig(context);

    // On unfixed code this will FAIL — returns "advisory" because includes() misses unquoted values
    expect(config.gatingMode).toBe("hard_block");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bug 3 — fetchConstitution returns raw string instead of parsed objects
// ══════════════════════════════════════════════════════════════════════════════

describe("Bug 3 — fetchConstitution returns structured clause objects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return an array of clause objects with id, title, category, description", async () => {
    const constitutionYaml = [
      "clauses:",
      "  - id: 1",
      '    title: "TypeScript Only"',
      '    category: "Architecture"',
      '    description: "All new application code must be written in TypeScript."',
      "  - id: 2",
      '    title: "No Hardcoded Secrets"',
      '    category: "Security"',
      '    description: "Never hardcode passwords or API keys."',
    ].join("\n");

    const base64Content = Buffer.from(constitutionYaml).toString("base64");

    const context = {
      octokit: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: { content: base64Content },
          }),
        },
      },
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
        pull_request: {
          head: { sha: "abc123" },
        },
      },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    } as any;

    const result: any = await fetchConstitution(context);

    // On unfixed code this will FAIL — returns a raw YAML string, not an array
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("title");
    expect(result[0]).toHaveProperty("category");
    expect(result[0]).toHaveProperty("description");
    expect(result[0].title).toBe("TypeScript Only");
    expect(result[1].title).toBe("No Hardcoded Secrets");
  });
});
