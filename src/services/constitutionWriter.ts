import yaml from "js-yaml";

/**
 * Pure function: parses YAML, determines next ID, appends clause, serializes.
 * Exported separately for testability.
 */
export function appendClauseToYaml(
  yamlContent: string,
  clause: { title: string; description: string; category: string }
): string {
  const doc = yaml.load(yamlContent) as {
    clauses?: { id: number; title: string; description: string; category: string }[];
  };

  if (!doc.clauses || doc.clauses.length === 0) {
    doc.clauses = [];
  }

  const maxId =
    doc.clauses.length > 0
      ? Math.max(...doc.clauses.map((c) => c.id))
      : 0;

  const newClause = {
    id: maxId + 1,
    title: clause.title,
    description: clause.description,
    category: clause.category,
  };

  doc.clauses.push(newClause);

  return yaml.dump(doc);
}

/**
 * Pure function: converts a clause title into a sanitized branch name.
 * Returns `crs/adopt-clause-<slug>` where slug is lowercase alphanumeric+hyphens.
 */
export function sanitizeBranchName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `crs/adopt-clause-${slug || "untitled"}`;
}

/**
 * Reads constitution.yaml from the repo's default branch, appends a new clause,
 * creates a branch, commits, and opens a PR. Returns the PR URL.
 */
export async function createConstitutionPR(params: {
  octokit: any;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  clause: { title: string; description: string };
  sourcePrNumber: number;
  reason: string;
}): Promise<string> {
  const { octokit, repoOwner, repoName, defaultBranch, clause, sourcePrNumber, reason } = params;

  // 1. Read constitution.yaml from the default branch
  const fileResponse = await octokit.repos.getContent({
    owner: repoOwner,
    repo: repoName,
    path: "constitution/constitution.yaml",
    ref: defaultBranch,
  });

  const currentContent = Buffer.from(fileResponse.data.content, "base64").toString("utf-8");
  const fileSha = fileResponse.data.sha;

  // 2. Append the new clause to the YAML
  const updatedContent = appendClauseToYaml(currentContent, {
    title: clause.title,
    description: clause.description,
    category: "AI-Suggested",
  });

  // 3. Get the default branch SHA
  const refResponse = await octokit.git.getRef({
    owner: repoOwner,
    repo: repoName,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = refResponse.data.object.sha;

  // 4. Create a new branch
  const branchName = sanitizeBranchName(clause.title);
  await octokit.git.createRef({
    owner: repoOwner,
    repo: repoName,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  // 5. Commit the updated file to the new branch
  const commitMessage = `chore: adopt constitution clause "${clause.title}" (from PR #${sourcePrNumber})`;
  await octokit.repos.createOrUpdateFileContents({
    owner: repoOwner,
    repo: repoName,
    path: "constitution/constitution.yaml",
    message: commitMessage,
    content: Buffer.from(updatedContent).toString("base64"),
    sha: fileSha,
    branch: branchName,
  });

  // 6. Open a PR from the new branch to the default branch
  const prTitle = `[CRS] Adopt clause: ${clause.title}`;
  const prBody = [
    `## 📜 New Constitution Clause`,
    ``,
    `**Title:** ${clause.title}`,
    `**Description:** ${clause.description}`,
    `**Category:** AI-Suggested`,
    ``,
    `### Reason`,
    reason,
    ``,
    `---`,
    `*Adopted from PR #${sourcePrNumber}.*`,
  ].join("\n");

  const prResponse = await octokit.pulls.create({
    owner: repoOwner,
    repo: repoName,
    title: prTitle,
    body: prBody,
    head: branchName,
    base: defaultBranch,
  });

  return prResponse.data.html_url;
}
