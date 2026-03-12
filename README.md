# Constitutional Review Studio (CRS) 🏛️

> An AI-native GitHub App built with [Probot](https://github.com/probot/probot) and React that provides deep governance, reviewer gamification, and AI debate functionalities natively during Pull Requests.

CRS bridges the gap between AI code generation and human review by establishing an evolving "Constitution." It scores reviewers, enforces hard-blocking constitution clauses, and debates code decisions before humans even look at the diff.

---

## 🛠 Prerequisites

To run CRS locally, you will need:
- **Node.js** (v18+)
- **PostgreSQL** running locally
- **Redis** running locally (for tracking recurring violations)
- An **Anthropic API Key** with `claude-3-7-sonnet-20250219` access
- A **GitHub Account / Organization** to install the App

## 🚀 Setup & Installation

### 1. Database & Cache Setup
Ensure you have Postgres and Redis running.
Create a local Postgres database:
```sh
createdb crs_db
```

### 2. Configure Environment Variables
Inside the `crs-app` folder, create a `.env` file and configure it:

```env
# GitHub App Settings (You will get these in Step 3)
APP_ID=
PRIVATE_KEY=
WEBHOOK_SECRET=development

# Forwarding webhook payload for local development via Smee.io
WEBHOOK_PROXY_URL=https://smee.io/WjHPu1bNtqx2XyVi 

# Database and Cache
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crs_db?schema=public"
REDIS_URL="redis://localhost:6379"

# Anthropic
ANTHROPIC_API_KEY="sk-..."
```

### 3. Register the GitHub App
To run the bot locally and connect it to GitHub, you need to register it.
Run the following inside `crs-app`:
```sh
npm install
npm run dev
```
Wait a moment! If `APP_ID` and `PRIVATE_KEY` are empty in your `.env`, Probot will automatically provide a localhost UI. Open **http://localhost:3000** in your browser and click "Register GitHub App". This will automatically provision the app, download the `.env` file, and populate the credentials for you!

### 4. Initialize the Database
Now that the app and `.env` are set, push the Prisma schema to configure the Postgres DB:
```sh
npx prisma db push
npx prisma generate
```

---

## 🏃‍♂️ Running the System

You need to run TWO servers simultaneously during development: the Probot Backend (App + API) and the React Dashboard.

**Terminal 1: Probot Backend**
```sh
cd crs-app
npm run dev
```
This runs the GitHub bot and exposes the API on `http://localhost:3000/api`.

**Terminal 2: React Analytics Dashboard**
```sh
cd crs-app/dashboard
npm install
npm run dev
```
Open **http://localhost:5173** to view the live Gamification & Analytics Dashboard!

---

## 📜 Usage & Governance

### The Constitution
Create a file at `.github/crs-config.yml` in your target repository to configure gating:
```yaml
gating_mode: hard_block # Options: advisory, soft_block, hard_block
```

Create a file at `constitution/constitution.yaml` in your repository detailing the codebase rules. Example:
```yaml
clauses:
  - id: 1
    title: No direct database queries in controllers
    category: Architecture
```

### PR Engagement
When a PR is opened, CRS will run an AI Debate, check for violations against the constitution, and generate Review Tiles.
Reviewers can interact by commenting on the PR:
- `/crs approve <tile_name>` (Grants +5 Points to reviewer)
- `/crs flag <tile_name> <reason>` (Grants +15 Points for correcting AI)

Violated clauses automatically scale up in **Confidence Score**. At 80/100, they lock into `Hard Block` status and strictly block PRs!
