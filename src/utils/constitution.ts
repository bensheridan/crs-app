import { Context } from "probot";

export async function fetchConstitution(context: Context<"pull_request">): Promise<string> {
    try {
        const response = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: "constitution/constitution.yaml",
            ref: context.payload.pull_request.head.sha
        });

        if ("content" in response.data) {
            return Buffer.from(response.data.content, "base64").toString("utf-8");
        }
    } catch (error) {
        context.log.info({ err: error }, "Failed to fetch constitution.yaml from the repository.");
    }
    return "";
}
