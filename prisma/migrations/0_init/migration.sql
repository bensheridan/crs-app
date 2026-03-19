-- Baseline migration — captures the full schema as it was created via `prisma db push`.
-- Marked as already applied with `prisma migrate resolve --applied 0_init`.
-- Future schema changes MUST go through `prisma migrate dev`.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Clause" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "violation_count" INTEGER NOT NULL DEFAULT 0,
    "last_violated_at" TIMESTAMP(3),
    "auto_enforce" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "source_pr" INTEGER,
    "confidence_score" INTEGER NOT NULL DEFAULT 0,
    "enforcement_level" TEXT NOT NULL DEFAULT 'advisory',

    CONSTRAINT "Clause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "clause_id" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "reviewer" TEXT NOT NULL,
    "ai_agent_version" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewerProfile" (
    "id" TEXT NOT NULL,
    "github_id" TEXT NOT NULL,
    "constitution_score" INTEGER NOT NULL DEFAULT 0,
    "regression_score" INTEGER NOT NULL DEFAULT 0,
    "clauses_created" INTEGER NOT NULL DEFAULT 0,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "agreed_with_ai" INTEGER NOT NULL DEFAULT 0,
    "overrode_ai" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReviewerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClauseProposal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suggestion_count" INTEGER NOT NULL DEFAULT 1,
    "source_prs" INTEGER[],
    "repo_owner" TEXT NOT NULL,
    "repo_name" TEXT NOT NULL,
    "adopted_by" TEXT,
    "rejected_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClauseProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebateRecord" (
    "id" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "repo_owner" TEXT NOT NULL,
    "repo_name" TEXT NOT NULL,
    "debate_confidence" INTEGER NOT NULL,
    "confidence_label" TEXT NOT NULL,
    "total_rounds" INTEGER NOT NULL,
    "max_rounds" INTEGER NOT NULL,
    "terminated_early" BOOLEAN NOT NULL DEFAULT false,
    "transcript" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebateRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebateRound" (
    "id" TEXT NOT NULL,
    "debate_id" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "primary_argument" TEXT NOT NULL,
    "devil_rebuttal" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "strength_label" TEXT NOT NULL,
    "constitutional_references" TEXT[],
    "evidence_citations" TEXT[],
    "coherence_rating" INTEGER NOT NULL,

    CONSTRAINT "DebateRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewerProfile_github_id_key" ON "ReviewerProfile"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "Metric_name_key" ON "Metric"("name");

-- CreateIndex
CREATE INDEX "ClauseProposal_status_idx" ON "ClauseProposal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClauseProposal_title_repo_owner_repo_name_key" ON "ClauseProposal"("title", "repo_owner", "repo_name");

-- CreateIndex
CREATE INDEX "DebateRecord_repo_owner_repo_name_idx" ON "DebateRecord"("repo_owner", "repo_name");

-- CreateIndex
CREATE INDEX "DebateRecord_created_at_idx" ON "DebateRecord"("created_at");

-- CreateIndex
CREATE INDEX "DebateRound_debate_id_idx" ON "DebateRound"("debate_id");

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_clause_id_fkey" FOREIGN KEY ("clause_id") REFERENCES "Clause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebateRound" ADD CONSTRAINT "DebateRound_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "DebateRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
