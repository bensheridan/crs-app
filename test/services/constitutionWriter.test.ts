import { describe, it, expect, vi } from "vitest";
import yaml from "js-yaml";
import fc from "fast-check";
import { appendClauseToYaml, sanitizeBranchName, createConstitutionPR } from "../../src/services/constitutionWriter.js";

describe("appendClauseToYaml", () => {
  const existingYaml = `clauses:
  - id: 1
    title: "TypeScript Only"
    category: "Architecture"
    description: "All new application code must be written in TypeScript."
  - id: 3
    title: "No Hardcoded Secrets"
    category: "Security"
    description: "Never hardcode passwords or API keys."
`;

  it("appends a new clause with the next sequential id", () => {
    const result = appendClauseToYaml(existingYaml, {
      title: "Automated Secret Scanning",
      description: "Require a pre-commit hook that scans for secrets.",
      category: "AI-Suggested",
    });

    const parsed = yaml.load(result) as { clauses: { id: number; title: string; category: string; description: string }[] };
    expect(parsed.clauses).toHaveLength(3);
    expect(parsed.clauses[2]).toEqual({
      id: 4,
      title: "Automated Secret Scanning",
      description: "Require a pre-commit hook that scans for secrets.",
      category: "AI-Suggested",
    });
  });

  it("preserves all original clauses unchanged", () => {
    const result = appendClauseToYaml(existingYaml, {
      title: "New Rule",
      description: "Some description.",
      category: "AI-Suggested",
    });

    const parsed = yaml.load(result) as { clauses: { id: number; title: string }[] };
    expect(parsed.clauses[0].id).toBe(1);
    expect(parsed.clauses[0].title).toBe("TypeScript Only");
    expect(parsed.clauses[1].id).toBe(3);
    expect(parsed.clauses[1].title).toBe("No Hardcoded Secrets");
  });

  it("handles empty clauses array by starting with id 1", () => {
    const emptyYaml = "clauses: []\n";
    const result = appendClauseToYaml(emptyYaml, {
      title: "First Rule",
      description: "The very first clause.",
      category: "AI-Suggested",
    });

    const parsed = yaml.load(result) as { clauses: { id: number; title: string }[] };
    expect(parsed.clauses).toHaveLength(1);
    expect(parsed.clauses[0].id).toBe(1);
    expect(parsed.clauses[0].title).toBe("First Rule");
  });

  it("handles undefined clauses by starting with id 1", () => {
    const noClausesYaml = "clauses:\n";
    const result = appendClauseToYaml(noClausesYaml, {
      title: "First Rule",
      description: "The very first clause.",
      category: "AI-Suggested",
    });

    const parsed = yaml.load(result) as { clauses: { id: number; title: string }[] };
    expect(parsed.clauses).toHaveLength(1);
    expect(parsed.clauses[0].id).toBe(1);
  });

  it("produces valid YAML that round-trips without error", () => {
    const result = appendClauseToYaml(existingYaml, {
      title: "Test Clause",
      description: "Testing round-trip.",
      category: "AI-Suggested",
    });

    expect(() => yaml.load(result)).not.toThrow();
    const reparsed = yaml.dump(yaml.load(result) as object);
    expect(() => yaml.load(reparsed)).not.toThrow();
  });
});

describe("sanitizeBranchName", () => {
  it("converts a simple title to a branch name", () => {
    expect(sanitizeBranchName("Automated Secret Scanning")).toBe(
      "crs/adopt-clause-automated-secret-scanning"
    );
  });

  it("lowercases mixed-case titles", () => {
    expect(sanitizeBranchName("No Hardcoded SECRETS")).toBe(
      "crs/adopt-clause-no-hardcoded-secrets"
    );
  });

  it("replaces special characters with hyphens", () => {
    expect(sanitizeBranchName("rule: no_secrets! (v2)")).toBe(
      "crs/adopt-clause-rule-no-secrets-v2"
    );
  });

  it("collapses multiple consecutive hyphens", () => {
    expect(sanitizeBranchName("foo---bar")).toBe("crs/adopt-clause-foo-bar");
  });

  it("removes leading and trailing hyphens from slug", () => {
    expect(sanitizeBranchName("---hello---")).toBe("crs/adopt-clause-hello");
  });

  it("uses 'untitled' fallback for empty string", () => {
    expect(sanitizeBranchName("")).toBe("crs/adopt-clause-untitled");
  });

  it("uses 'untitled' fallback when title is only special characters", () => {
    expect(sanitizeBranchName("!@#$%^&*()")).toBe("crs/adopt-clause-untitled");
  });

  it("handles unicode characters", () => {
    const result = sanitizeBranchName("règle café");
    expect(result).toMatch(/^crs\/adopt-clause-[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(result).not.toMatch(/^crs\/adopt-clause-$/);
  });

  it("handles single word title", () => {
    expect(sanitizeBranchName("security")).toBe("crs/adopt-clause-security");
  });
});

describe("createConstitutionPR", () => {
  const constitutionYaml = `clauses:
  - id: 1
    title: "TypeScript Only"
    category: "Architecture"
    description: "All new application code must be written in TypeScript."
`;
  const encodedContent = Buffer.from(constitutionYaml).toString("base64");

  function createMockOctokit(overrides: Record<string, any> = {}) {
    return {
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: { content: encodedContent, sha: "file-sha-123" },
        }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({}),
        ...overrides.repos,
      },
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: "base-sha-456" } },
        }),
        createRef: vi.fn().mockResolvedValue({}),
        ...overrides.git,
      },
      pulls: {
        create: vi.fn().mockResolvedValue({
          data: { html_url: "https://github.com/owner/repo/pull/99" },
        }),
        ...overrides.pulls,
      },
    };
  }

  const defaultParams = {
    repoOwner: "test-owner",
    repoName: "test-repo",
    defaultBranch: "main",
    clause: { title: "No Eval Usage", description: "Disallow eval() in production code." },
    sourcePrNumber: 42,
    reason: "eval() is a security risk",
  };

  it("reads constitution.yaml from the default branch", async () => {
    const octokit = createMockOctokit();
    await createConstitutionPR({ octokit, ...defaultParams });

    expect(octokit.repos.getContent).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      path: "constitution/constitution.yaml",
      ref: "main",
    });
  });

  it("creates a branch from the default branch SHA", async () => {
    const octokit = createMockOctokit();
    await createConstitutionPR({ octokit, ...defaultParams });

    expect(octokit.git.getRef).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      ref: "heads/main",
    });
    expect(octokit.git.createRef).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      ref: "refs/heads/crs/adopt-clause-no-eval-usage",
      sha: "base-sha-456",
    });
  });

  it("commits updated YAML with a descriptive message", async () => {
    const octokit = createMockOctokit();
    await createConstitutionPR({ octokit, ...defaultParams });

    const call = octokit.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(call.path).toBe("constitution/constitution.yaml");
    expect(call.message).toBe('chore: adopt constitution clause "No Eval Usage" (from PR #42)');
    expect(call.sha).toBe("file-sha-123");
    expect(call.branch).toBe("crs/adopt-clause-no-eval-usage");

    // Verify the committed content contains the new clause
    const committedYaml = Buffer.from(call.content, "base64").toString("utf-8");
    const parsed = yaml.load(committedYaml) as { clauses: { id: number; title: string; category: string }[] };
    expect(parsed.clauses).toHaveLength(2);
    expect(parsed.clauses[1].title).toBe("No Eval Usage");
    expect(parsed.clauses[1].category).toBe("AI-Suggested");
    expect(parsed.clauses[1].id).toBe(2);
  });

  it("opens a PR with correct title and body", async () => {
    const octokit = createMockOctokit();
    await createConstitutionPR({ octokit, ...defaultParams });

    const call = octokit.pulls.create.mock.calls[0][0];
    expect(call.title).toBe("[CRS] Adopt clause: No Eval Usage");
    expect(call.head).toBe("crs/adopt-clause-no-eval-usage");
    expect(call.base).toBe("main");
    expect(call.body).toContain("No Eval Usage");
    expect(call.body).toContain("Disallow eval() in production code.");
    expect(call.body).toContain("eval() is a security risk");
    expect(call.body).toContain("PR #42");
  });

  it("returns the PR html_url", async () => {
    const octokit = createMockOctokit();
    const url = await createConstitutionPR({ octokit, ...defaultParams });

    expect(url).toBe("https://github.com/owner/repo/pull/99");
  });

  it("propagates errors from GitHub API calls", async () => {
    const octokit = createMockOctokit({
      repos: { getContent: vi.fn().mockRejectedValue(new Error("Not Found")) },
    });

    await expect(createConstitutionPR({ octokit, ...defaultParams })).rejects.toThrow("Not Found");
  });
});

// Feature: constitution-auto-evolution, Property 6: YAML clause append round-trip
// **Validates: Requirements 4.2, 4.3, 4.7**
describe("Property 6: YAML clause append round-trip", () => {
  // Arbitrary for a single clause object
  const clauseArb = fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    category: fc.constantFrom("Architecture", "Security", "Observability", "Styling"),
    description: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  });

  // Arbitrary for a list of N clauses with unique sequential ids
  const clauseListArb = fc.integer({ min: 0, max: 10 }).chain((n) =>
    fc.array(clauseArb, { minLength: n, maxLength: n }).map((clauses) =>
      clauses.map((c, i) => ({ ...c, id: i + 1 }))
    )
  );

  // Arbitrary for the new clause to append
  const newClauseArb = fc.record({
    title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    description: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    category: fc.constant("AI-Suggested"),
  });

  it("appendClauseToYaml produces valid YAML with N+1 clauses, preserves originals, and has correct new clause", () => {
    fc.assert(
      fc.property(clauseListArb, newClauseArb, (existingClauses, newClause) => {
        // Build input YAML from generated clauses
        const inputDoc = { clauses: existingClauses.length > 0 ? existingClauses : [] };
        const inputYaml = yaml.dump(inputDoc);

        const result = appendClauseToYaml(inputYaml, newClause);

        // (a) Parses without error
        const parsed = yaml.load(result) as { clauses: { id: number; title: string; category: string; description: string }[] };
        expect(parsed).toBeDefined();
        expect(parsed.clauses).toBeDefined();

        // (b) Contains N+1 clauses
        expect(parsed.clauses).toHaveLength(existingClauses.length + 1);

        // (c) All original clauses are preserved unchanged
        for (let i = 0; i < existingClauses.length; i++) {
          expect(parsed.clauses[i].id).toBe(existingClauses[i].id);
          expect(parsed.clauses[i].title).toBe(existingClauses[i].title);
          expect(parsed.clauses[i].category).toBe(existingClauses[i].category);
          expect(parsed.clauses[i].description).toBe(existingClauses[i].description);
        }

        // (d) New clause has correct id, category, title, description
        const expectedId = existingClauses.length > 0
          ? Math.max(...existingClauses.map((c) => c.id)) + 1
          : 1;
        const appended = parsed.clauses[parsed.clauses.length - 1];
        expect(appended.id).toBe(expectedId);
        expect(appended.category).toBe("AI-Suggested");
        expect(appended.title).toBe(newClause.title);
        expect(appended.description).toBe(newClause.description);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: constitution-auto-evolution, Property 7: Branch name sanitization
// **Validates: Requirements 4.4**
describe("Property 7: Branch name sanitization", () => {
  it("sanitizeBranchName produces valid branch name matching pattern for any title string", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const result = sanitizeBranchName(title);

        // Result matches pattern crs/adopt-clause-<slug>
        expect(result).toMatch(/^crs\/adopt-clause-/);

        // Extract slug
        const slug = result.replace("crs/adopt-clause-", "");

        // Slug contains only lowercase alphanumeric chars and hyphens
        expect(slug).toMatch(/^[a-z0-9-]+$/);

        // Slug is non-empty
        expect(slug.length).toBeGreaterThan(0);

        // Slug does not start or end with a hyphen
        expect(slug).not.toMatch(/^-/);
        expect(slug).not.toMatch(/-$/);
      }),
      { numRuns: 100 }
    );
  });
});
