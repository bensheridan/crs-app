# Constitutional Review Studio (CRS)
### Governing AI-Generated Code with AI
**Innovation Day Pitch — AI Accelerator Team**

---

## Slide 1 — The World Changed

> **AI tools now write a significant portion of our code.**
> Copilot. ChatGPT. Claude. The diff is getting longer, PRs are coming faster.

**The review process hasn't changed.**

- Same humans, same eyes, more code
- Rubber-stamp reviews are becoming the norm
- The same architectural mistakes repeat PR after PR
- Team standards live in a wiki nobody opens during a review

**The gap: AI generates code. Nothing governs it.**

---

## Slide 2 — The Problem

**What's the problem to solve?**

1. **Volume** — AI-assisted devs push more PRs, faster. Review quality degrades under load.
2. **Drift** — Code standards erode incrementally. One shortcut at a time.
3. **No memory** — The same violation happens in PR #4, PR #17, PR #31. Nobody connects the dots.
4. **Misaligned incentives** — Reviewers are measured on speed, not depth.

> *Every team has a constitution. Nobody enforces it.*

---

## Slide 3 — The Solution

**What's the potential solution?**

### Constitutional Review Studio (CRS)

A GitHub App that installs on any repo and acts as your team's AI-powered governance layer.

**The core idea:** Your team's standards live in a `constitution.yaml` file — not a wiki.
Every PR is reviewed by AI against that Constitution. Automatically. Before humans see the diff.

```
PR Opened
  → AI reads the diff + Constitution
  → Primary AI flags violations
  → Devil's Advocate AI debates the review
  → Review tiles posted to PR
  → Violations tracked, confidence scores escalate
  → At 80/100 confidence → Hard Block (PR cannot merge)
```

**The Constitution evolves.** The more a clause is violated, the harder it becomes to bypass.

---

## Slide 4 — How It Works

**Step-by-step flow:**

| Step | What Happens |
|------|-------------|
| 1. PR opened | CRS fetches the full diff via GitHub API |
| 2. Constitution loaded | YAML rules fetched from the repo |
| 3. Primary AI Review | Claude reads diff against every clause, flags violations |
| 4. Devil's Advocate | A second AI agent critiques the primary review — challenges false positives, finds missed violations |
| 5. Review Tiles posted | Structured review tiles appear in the PR as a GitHub Check |
| 6. Confidence scoring | Violations increment a clause's confidence score (stored in PostgreSQL) |
| 7. Hard Block | Any clause at 80/100 confidence is locked — PRs that violate it **cannot merge** |

---

## Slide 5 — The Living Constitution

**This isn't a linter. It learns.**

Your constitution starts simple:

```yaml
clauses:
  - id: 1
    title: TypeScript Only
    category: Architecture
  - id: 2
    title: No Hardcoded Secrets
    category: Security
  - id: 3
    title: Include Meaningful Logging
    category: Observability
```

Over time:
- Violations are tracked with recency weighting (Redis)
- Confidence scores climb with each recurrence
- **At 80/100 → the clause auto-escalates to Hard Block status**
- The system gets harder to violate the more it's violated

> The Constitution doesn't just document standards. It enforces them, and it escalates.

---

## Slide 6 — Reviewer Gamification

**Making human review better, not optional.**

CRS rewards reviewers who engage:

| Action | Points |
|--------|--------|
| `/crs approve <tile>` | +5 pts — confirms AI finding |
| `/crs flag <tile> <reason>` | +15 pts — corrects the AI |

**Why this matters:**
- Reviewers are incentivized to actually read AI output, not dismiss it
- Correcting the AI teaches the system where its constitution is ambiguous
- Dashboard shows team leaderboard, top reviewers, violation trends

> Catching AI mistakes pays more than rubber-stamping them.

---

## Slide 7 — What's Already Built

**Demo-ready today.**

| Component | Status |
|---|---|
| Probot GitHub App (webhook listener) | Done |
| PR diff fetching + Constitution loader | Done |
| Primary AI review (Claude claude-sonnet-4-5) | Done |
| Devil's Advocate AI debate agent | Done |
| Confidence scoring + escalation logic | Done |
| Hard Block enforcement via GitHub Check | Done |
| PostgreSQL violation tracking | Done |
| Redis recency weighting | Done |
| React analytics dashboard | Done |
| `/crs approve` and `/crs flag` commands | Done |

**Stack:** TypeScript · Probot · PostgreSQL · Redis · Anthropic Claude (claude-sonnet-4-5) · React · Vite

**To run it:** Install on a GitHub org, add a `constitution.yaml`, open a PR.

---

## Slide 8 — Why This Is Different

**Not SonarQube. Not GitHub Copilot Code Review. Not CODEOWNERS.**

| Tool | What It Does | What It Can't Do |
|------|-------------|-----------------|
| SonarQube | Static code analysis | Enforces team-specific architectural rules |
| Copilot Code Review | AI suggestions inline | Enforces escalating, org-specific standards |
| CODEOWNERS | Routes PRs to reviewers | Reviews the diff, debates findings, blocks merges |
| **CRS** | All of the above | Nothing — this is the missing layer |

**The key differentiator:**
- Standards are *machine-executable*, not doc-bound
- Two AI agents debate every review — reducing false positives
- Violations *escalate automatically* based on recurrence
- Human reviewers are *incentivized to improve* not just approve

---

## Slide 9 — Why Now, Why Us

**The AI code generation wave is here. Governance hasn't caught up.**

- Every team that adopts AI coding tools will face this problem
- The teams that build governance infrastructure *now* will ship better code at scale
- CRS is a force multiplier on existing review culture — it doesn't replace it

**Relevance to Gallagher:**
- Applicable to any GitHub-hosted repo across any team
- Directly addresses code quality risk as AI adoption grows
- Measurable: violation rate, review engagement, time-to-merge with standards enforced
- Low installation friction — it's a GitHub App

---

## Slide 10 — The Ask

**What do we need?**

**Pilot:** Install CRS on one team's repo for 30 days.

**Phase 1 — Setup (Week 1):**
- Identify a willing team and repo
- Collaborate to write an initial `constitution.yaml` (5-10 clauses)
- Install the GitHub App and configure gating mode (advisory → soft block → hard block)

**Phase 2 — Run (Weeks 2-4):**
- Open PRs as normal
- CRS reviews every diff, posts review tiles
- Reviewers interact with `/crs approve` and `/crs flag`

**Measure:**
- How many violations caught before human review?
- How often did the AI debate change the final call?
- Did reviewer engagement improve?

**Resources needed:** One repo, one team willing to try it, access to an Anthropic API key.

> The Constitution is already written. We just need a repo to govern.

---

## Quick Reference — The 5 Questions

| Question | Answer |
|---|---|
| **What's the problem?** | AI-generated code floods PRs; review quality degrades; same violations repeat; standards drift. |
| **What's the solution?** | CRS — a living Constitution enforced by dual AI agents on every PR, with confidence-based hard blocks. |
| **What's innovative?** | Standards that *self-escalate* based on recurrence; AI debates its own reviews; gamified human oversight. |
| **What's already built?** | Full working app — PR review, debate, gamification, dashboard, hard blocking. All of it. |
| **What's the ask?** | Pilot on one repo for 30 days. One team, one constitution, one API key. |

---

*Constitutional Review Studio — github.com/[your-org]/crs-app*
