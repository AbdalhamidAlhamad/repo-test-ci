import { GluegunCommand } from "gluegun";
import { GitHubClient } from "../clients/github-client";
import { resolveConflictsForPR } from "../utils/github-conflict-resolver";
import { EventContext, PRInfo } from "../types/github.types";
import {
  buildEventContextFromGitHub,
  resolveGitHubConfigFromEnv,
} from "../utils/github-actions-context";
import { print } from "gluegun";
import { Errors } from "../constants/errors";

const command: GluegunCommand = {
  name: "auto-resolve:publish-conflicts",
  description:
    "Auto-resolve publish conflicts for PRs. Handles PR selection, metadata fetching, conflict resolution, and PR commenting.",
  run: async () => {
    try {
      print.info("Auto-resolving publish conflicts...");
      const githubConfig = resolveGitHubConfigFromEnv();
      print.info("Resolved GitHub config.");
      const eventContext = await buildEventContextFromGitHub();
      print.info("Built event context.");
      const githubClient = new GitHubClient(githubConfig);
      print.info("Created GitHub client.");

      const prNumbers = await selectTargetPullRequests(
        eventContext,
        githubClient,
      );

      if (prNumbers.length === 0) {
        print.info("No PRs found to process.");
        return;
      }

      let processedCount = 0;
      let resolvedCount = 0;

      for (const prNum of prNumbers) {
        print.info(`\n📋 Processing PR #${prNum}...`);

        try {
          const pr = await githubClient.waitForMergeableState(prNum);
          const headRepoFullName = pr.head.repo?.full_name || "";
          const baseRepoFullName = `${githubConfig.owner}/${githubConfig.repo}`;
          const sameRepo = headRepoFullName === baseRepoFullName;

          const prInfo: PRInfo = {
            number: prNum,
            headRef: pr.head.ref,
            headRepoFull: headRepoFullName,
            baseRef: pr.base.ref,
            mergeableState: pr.mergeable_state || "unknown",
            canPush: sameRepo,
            htmlUrl: pr.html_url,
          };

          print.info(
            `PR #${prNum}: ${prInfo.mergeableState} (can_push: ${prInfo.canPush})`,
          );

          if (prInfo.mergeableState !== "dirty") {
            print.info(`PR #${prNum} is not marked as dirty. Nothing to do.`);
            processedCount += 1;
            continue;
          }

          if (!prInfo.canPush) {
            print.info(
              `PR #${prNum} comes from a fork. Skipping because pushing is not allowed.`,
            );
            processedCount += 1;
            continue;
          }

          const resolved = await resolveConflictsForPR(prInfo);
          processedCount += 1;

          if (resolved) {
            resolvedCount += 1;
            await commentWithSummary(githubClient, prNum);
          }
        } catch (error) {
          print.error(`Failed to process PR #${prNum}: ${error}`);
        }
      }

      print.success(
        `\n✅ Processed ${processedCount} PR(s), resolved ${resolvedCount} conflict(s)`,
      );
    } catch (error) {
      print.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
};

export default command;

async function selectTargetPullRequests(
  ctx: EventContext,
  githubClient: GitHubClient,
): Promise<number[]> {
  const { eventName, eventPrNumber, baseBranch } = ctx;

  if (!eventName) {
    throw new Error(Errors.NO_EVENT_NAME_PROVIDED);
  }

  if (eventName === "workflow_dispatch") {
    return selectPullRequestsForWorkflowDispatch(ctx, githubClient);
  }

  if (eventName === "push") {
    const targetBase = baseBranch || ctx.eventBaseRef || "main";
    print.info(
      `Push event detected: finding all open PRs targeting ${targetBase}...`,
    );

    try {
      const prNumbers =
        await githubClient.listOpenPullRequestNumbers(targetBase);
      print.info(
        `Found ${prNumbers.length} open PR(s) targeting ${targetBase}`,
      );
      return prNumbers;
    } catch (error) {
      throw new Error(Errors.FAILED_TO_FETCH_PRS);
    }
  }

  if (!eventPrNumber) {
    throw new Error(Errors.PR_NUMBER_REQUIRED);
  }

  if (eventName === "pull_request_target") {
    print.info(`PR event detected: processing PR #${eventPrNumber}`);
    return [eventPrNumber];
  }

  throw new Error(Errors.UNSUPPORTED_EVENT_TYPE);
}

async function selectPullRequestsForWorkflowDispatch(
  ctx: EventContext,
  githubClient: GitHubClient,
): Promise<number[]> {
  const { mode, baseBranch, prNumber } = ctx;

  if (mode === "single") {
    if (!prNumber) {
      throw new Error(Errors.PR_NUMBER_REQUIRED);
    }

    print.info(`Single mode: processing PR #${prNumber}`);
    return [prNumber];
  }

  if (mode === "all") {
    const targetBase = baseBranch || "main";
    print.info(`Finding all open PRs targeting ${targetBase}...`);

    try {
      const prNumbers =
        await githubClient.listOpenPullRequestNumbers(targetBase);
      print.info(
        `Found ${prNumbers.length} open PR(s) targeting ${targetBase}`,
      );
      return prNumbers;
    } catch (error) {
      throw new Error(Errors.FAILED_TO_FETCH_PRS);
    }
  }

  throw new Error(Errors.INVALID_MODE);
}

async function commentWithSummary(
  githubClient: GitHubClient,
  prNumber: number,
) {
  try {
    const { sha, files } =
      await githubClient.getHeadCommitSummaryForPr(prNumber);

    const updatedFilesLines = files.length
      ? ["Updated files:", ...files.map((f) => `- \`${f}\``), ""]
      : [];

    const commentBody = [
      "✅ Auto-resolved publishing conflicts.",
      "",
      `Commit: \`${sha}\``,
      "",
      ...updatedFilesLines,
      "_This was performed by the **Auto Resolve Publish Conflicts** workflow._",
    ].join("\n");

    await githubClient.createComment(prNumber, commentBody);
    print.success(`✅ Commented on PR #${prNumber}`);
  } catch (error) {
    print.warning(`Failed to comment on PR #${prNumber}: ${error}`);
  }
}
