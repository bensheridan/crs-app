import { prisma } from "./db.js";

// Helper to seed clauses into DB if they don't exist yet, avoiding foreign key errors.
export async function ensureClauseExists(clauseName: string) {
    // Basic clause management
    let clause = await prisma.clause.findFirst({
        where: { title: clauseName }
    });

    if (!clause) {
        clause = await prisma.clause.create({
            data: {
                title: clauseName,
                category: "General", // Default category
                auto_enforce: false
            }
        });
    }
    return clause;
}

export async function logViolation(clauseName: string, prNumber: number, reviewer: string, agentVersion?: string) {
    try {
        const clause = await ensureClauseExists(clauseName);

        await prisma.violation.create({
            data: {
                clause_id: clause.id,
                pr_number: prNumber,
                reviewer: reviewer,
                ai_agent_version: agentVersion || "unknown"
            }
        });

        // Calculate new confidence score and enforcement level
        const newScore = Math.min((clause.confidence_score || 0) + 5, 100);
        let newEnforcementLevel = clause.enforcement_level || "advisory";

        if (newScore >= 80) {
            newEnforcementLevel = "hard_block";
        } else if (newScore >= 40) {
            newEnforcementLevel = "soft_block";
        }

        // Update the violation count and auto-scaling logic on the clause itself
        await prisma.clause.update({
            where: { id: clause.id },
            data: {
                violation_count: { increment: 1 },
                confidence_score: newScore,
                enforcement_level: newEnforcementLevel,
                last_violated_at: new Date()
            }
        });

    } catch (err) {
        console.error("Failed to log violation:", err);
    }
}

export async function getRecentViolations(limit: number = 10) {
    return prisma.violation.findMany({
        take: limit,
        orderBy: { timestamp: "desc" },
        include: { clause: true }
    });
}

export async function getHardBlockClauses() {
    return prisma.clause.findMany({
        where: { enforcement_level: "hard_block" }
    });
}
