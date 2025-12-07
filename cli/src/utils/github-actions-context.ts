import { promises as fsPromises } from "fs";

import {
  ConflictResolveMode,
  EventContext,
  GitHubConfig,
} from "../types/github.types";
import { print } from "gluegun";
import { Errors } from "../constants/errors";
export function resolveGitHubConfigFromEnv(): GitHubConfig {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;

  if (!GITHUB_TOKEN) {
    print.error("Missing required env: GITHUB_TOKEN");
    throw new Error(Errors.MISSING_GITHUB_TOKEN);
  }

  if (!GITHUB_REPOSITORY) {
    print.error(
      "Missing required env: GITHUB_REPOSITORY (expected format 'owner/repo')",
    );
    throw new Error(Errors.MISSING_GITHUB_REPOSITORY);
  }

  const [owner, repo] = GITHUB_REPOSITORY.split("/");

  if (!owner || !repo) {
    print.error(
      `Invalid GITHUB_REPOSITORY value: "${GITHUB_REPOSITORY}". Expected "owner/repo".`,
    );
    throw new Error(Errors.MALFORMED_GITHUB_REPOSITORY);
  }

  return { owner, repo, token: GITHUB_TOKEN };
}

export async function buildEventContextFromGitHub(): Promise<EventContext> {
  const env = process.env;

  const eventName = env.GITHUB_EVENT_NAME || "";

  let mode: ConflictResolveMode = "single";
  let baseBranch = "main";
  let prNumber: number | undefined;
  let eventPrNumber: number | undefined;
  let eventBaseRef = "main";

  const eventPath = env.GITHUB_EVENT_PATH;

  if (eventPath) {
    try {
      const content = await fsPromises.readFile(eventPath, "utf-8");
      const eventPayload = JSON.parse(content);

      if (eventPayload.pull_request) {
        eventPrNumber = Number(eventPayload.pull_request.number);
        eventBaseRef = eventPayload.pull_request.base?.ref || "main";
      }

      if (eventPayload.ref) {
        const branchName =
          eventPayload.ref.match(/^refs\/heads\/(.+)$/)?.[1] || "main";
        baseBranch = eventBaseRef = branchName;
      }

      if (eventPayload.inputs) {
        mode = eventPayload.inputs.mode || "single";
        baseBranch = eventPayload.inputs.base_branch || "main";
        if (eventPayload.inputs.pr_number) {
          prNumber = Number(eventPayload.inputs.pr_number);
        }
      }
    } catch (error) {
      print.warning(
        `Could not read GitHub event payload: ${error}. Using defaults.`,
      );
    }
  }

  return {
    eventName,
    mode,
    baseBranch,
    prNumber,
    eventPrNumber,
    eventBaseRef,
  };
}
