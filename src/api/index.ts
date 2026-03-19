import { Router } from "express";
import { prisma } from "../services/db.js";
import { queryProposals } from "../services/proposalService.js";

// Returns a configured express Router for the analytics dashboard
export function getApiRouter(): Router {
    const router = Router();

    // Health check
    router.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    // Get all clauses
    router.get("/clauses", async (_req, res) => {
        try {
            const clauses = await prisma.clause.findMany({
                orderBy: { violation_count: "desc" }
            });
            res.json(clauses);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch clauses" });
        }
    });

    // Get recent violations
    router.get("/violations", async (_req, res) => {
        try {
            const violations = await prisma.violation.findMany({
                take: 50,
                orderBy: { timestamp: "desc" },
                include: { clause: true }
            });
            res.json(violations);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch violations" });
        }
    });

    // Get top reviewers
    router.get("/reviewers/top", async (_req, res) => {
        try {
            const reviewers = await prisma.reviewerProfile.findMany({
                take: 5,
                orderBy: { constitution_score: "desc" }
            });
            res.json(reviewers);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch top reviewers" });
        }
    });

    // Get org metrics
    router.get("/metrics/org", async (_req, res) => {
        try {
            const metrics = await prisma.metric.findMany();
            res.json(metrics);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch org metrics" });
        }
    });

    // Get clause proposals
    router.get("/proposals", async (req, res) => {
        try {
            const validStatuses = ["pending", "adopted", "rejected"];
            const status = req.query.status as string | undefined;

            if (status && !validStatuses.includes(status)) {
                res.status(400).json({ error: `Invalid status filter. Must be one of: ${validStatuses.join(", ")}` });
                return;
            }

            const proposals = await queryProposals({
                status: status as "pending" | "adopted" | "rejected" | undefined,
            });
            res.json(proposals);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch proposals" });
        }
    });

    // Get all debates (without transcript)
    router.get("/debates", async (_req, res) => {
        try {
            const debates = await prisma.debateRecord.findMany({
                orderBy: { created_at: "desc" },
            });
            const result = debates.map(({ transcript, ...rest }) => rest);
            res.json(result);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch debates" });
        }
    });

    // Get debate metrics (must be before :id route)
    router.get("/debates/metrics", async (_req, res) => {
        try {
            const debates = await prisma.debateRecord.findMany({
                select: { debate_confidence: true },
            });
            const totalDebates = debates.length;
            const averageConfidence =
                totalDebates === 0
                    ? 0
                    : Math.round(
                          debates.reduce((sum, d) => sum + d.debate_confidence, 0) /
                              totalDebates
                      );
            res.json({ averageConfidence, totalDebates });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch debate metrics" });
        }
    });

    // Get single debate by ID (with rounds)
    router.get("/debates/:id", async (req, res) => {
        try {
            const debate = await prisma.debateRecord.findUnique({
                where: { id: req.params.id },
                include: { rounds: true },
            });
            if (!debate) {
                res.status(404).json({ error: "Debate not found" });
                return;
            }
            res.json(debate);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch debate" });
        }
    });

    return router;
}
