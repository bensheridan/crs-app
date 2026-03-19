import { Context } from "probot";
import yaml from "js-yaml";

export interface CRSConfig {
    gatingMode: "advisory" | "soft_block" | "hard_block";
    flagsRequireReason: boolean;
    maxDebateRounds: number;
}

const DEFAULT_CONFIG: CRSConfig = {
    gatingMode: "advisory",
    flagsRequireReason: true,
    maxDebateRounds: 3
};

const VALID_GATING_MODES = ["advisory", "soft_block", "hard_block"] as const;

export async function fetchConfig(context: Context<any>): Promise<CRSConfig> {
    try {
        const response = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: ".github/crs-config.yml"
        });

        if ("content" in response.data) {
            const content = Buffer.from(response.data.content, "base64").toString("utf-8");
            const parsed = yaml.load(content) as Record<string, unknown> | null;

            if (!parsed || typeof parsed !== "object") {
                return DEFAULT_CONFIG;
            }

            const gatingMode = VALID_GATING_MODES.includes(parsed.gatingMode as any)
                ? (parsed.gatingMode as CRSConfig["gatingMode"])
                : "advisory";

            const flagsRequireReason = typeof parsed.flagsRequireReason === "boolean"
                ? parsed.flagsRequireReason
                : true;

            let maxDebateRounds = 3;
            if (typeof parsed.maxDebateRounds === "number" && Number.isInteger(parsed.maxDebateRounds)) {
                if (parsed.maxDebateRounds >= 2 && parsed.maxDebateRounds <= 5) {
                    maxDebateRounds = parsed.maxDebateRounds;
                } else {
                    context.log.warn(`maxDebateRounds value ${parsed.maxDebateRounds} is outside valid range [2, 5], using default 3`);
                }
            }

            return { gatingMode, flagsRequireReason, maxDebateRounds };
        }
    } catch (error) {
        context.log.info("No .github/crs-config.yml found, using defaults.");
    }
    return DEFAULT_CONFIG;
}
