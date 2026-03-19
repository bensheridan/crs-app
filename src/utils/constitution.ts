import { Context } from "probot";
import yaml from "js-yaml";

export interface ConstitutionClause {
    id: number;
    title: string;
    category: string;
    description: string;
}

export async function fetchConstitution(context: Context<"pull_request">): Promise<ConstitutionClause[]> {
    try {
        const response = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: "constitution/constitution.yaml",
            ref: context.payload.pull_request.head.sha
        });

        if ("content" in response.data) {
            const content = Buffer.from(response.data.content, "base64").toString("utf-8");
            const parsed = yaml.load(content) as Record<string, unknown> | null;

            if (parsed && typeof parsed === "object" && Array.isArray(parsed.clauses)) {
                return parsed.clauses as ConstitutionClause[];
            }
        }
    } catch (error) {
        context.log.info({ err: error }, "Failed to fetch constitution.yaml from the repository.");
    }
    return [];
}
