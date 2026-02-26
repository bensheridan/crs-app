import { Probot } from "probot";
import { handlePullRequest } from "./handlers/pullRequest.js";
import { handleIssueComment } from "./handlers/issueComment.js";
import { getApiRouter } from "./api/index.js";

export default (app: Probot, { getRouter }: { getRouter?: any }) => {
  app.on(["pull_request.opened", "pull_request.synchronize"], handlePullRequest as any);
  app.on("issue_comment.created", handleIssueComment as any);

  // Expose API endpoints for the Constitution Analytics Dashboard
  if (getRouter) {
    const router = getRouter("/api");
    router.use(getApiRouter());
    app.log.info("Successfully mounted /api router");
  } else {
    app.log.warn("Could not expose API router. getRouter was not available.");
  }

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
