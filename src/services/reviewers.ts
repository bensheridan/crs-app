import { prisma } from "./db.js";

/**
 * Ensures a reviewer profile exists in the database.
 */
export async function ensureReviewerExists(githubId: string) {
    let profile = await prisma.reviewerProfile.findUnique({
        where: { github_id: githubId }
    });

    if (!profile) {
        profile = await prisma.reviewerProfile.create({
            data: {
                github_id: githubId,
            }
        });
    }

    return profile;
}

/**
 * Updates a reviewer's score based on their interaction with an AI review tile.
 * @param action "approve" or "flag"
 */
export async function trackReviewerAction(githubId: string, action: "approve" | "flag") {
    try {
        const profile = await ensureReviewerExists(githubId);

        let updateData: any = {
            total_reviews: { increment: 1 }
        };

        if (action === "approve") {
            // Approving means they agreed with the AI
            updateData.agreed_with_ai = { increment: 1 };
            updateData.constitution_score = { increment: 5 }; // Base points for participation
        } else if (action === "flag") {
            // Flagging means they caught an AI mistake or corrected it
            updateData.overrode_ai = { increment: 1 };
            updateData.constitution_score = { increment: 15 }; // Higher points for corrections
        }

        await prisma.reviewerProfile.update({
            where: { id: profile.id },
            data: updateData
        });

        // Also track org-wide metric
        await trackOrgMetric(`total_${action}s`);
    } catch (err) {
        console.error("Failed to track reviewer action:", err);
    }
}

/**
 * Helper to track org-wide metrics sequentially.
 */
export async function trackOrgMetric(metricName: string) {
    try {
        await prisma.metric.upsert({
            where: { name: metricName },
            update: {
                value: { increment: 1 },
                last_updated_at: new Date()
            },
            create: {
                name: metricName,
                value: 1
            }
        });
    } catch (err) {
        console.error("Failed to track org metric:", err);
    }
}

/**
 * Retrieves the top reviewers sorted by constitution_score.
 */
export async function getTopReviewers(limit: number = 5) {
    return prisma.reviewerProfile.findMany({
        take: limit,
        orderBy: { constitution_score: "desc" }
    });
}
