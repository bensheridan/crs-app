import { Router } from "express";
import { prisma } from "../services/db.js";

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

    return router;
}
