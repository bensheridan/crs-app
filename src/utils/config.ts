import { Context } from "probot";

export interface CRSConfig {
    gatingMode: "advisory" | "soft_block" | "hard_block";
    flagsRequireReason: boolean;
}

const DEFAULT_CONFIG: CRSConfig = {
    gatingMode: "advisory",
    flagsRequireReason: true
};

export async function fetchConfig(context: Context<any>): Promise<CRSConfig> {
    try {
        const response = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: ".github/crs-config.yml"
        });

        if ("content" in response.data) {
            const content = Buffer.from(response.data.content, "base64").toString("utf-8");
            // A simple manual parse since the struct is very small. In a real app we'd use 'js-yaml'
            const isHardBlock = content.includes('gatingMode: "hard_block"') || content.includes("gatingMode: 'hard_block'");
            const isSoftBlock = content.includes('gatingMode: "soft_block"') || content.includes("gatingMode: 'soft_block'");

            return {
                gatingMode: isHardBlock ? "hard_block" : isSoftBlock ? "soft_block" : "advisory",
                flagsRequireReason: !content.includes("flagsRequireReason: false")
            };
        }
    } catch (error) {
        context.log.info("No .github/crs-config.yml found, using defaults.");
    }
    return DEFAULT_CONFIG;
}
