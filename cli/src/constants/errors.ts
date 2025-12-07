export const Errors = {
  NO_STAGED_CHANGES: "No staged changes after conflict resolution.",
  MISSING_GITHUB_TOKEN: "Invalid GitHub configuration: missing GITHUB_TOKEN",
  MISSING_GITHUB_REPOSITORY:
    "Invalid GitHub configuration: missing GITHUB_REPOSITORY",
  MALFORMED_GITHUB_REPOSITORY:
    "Invalid GitHub configuration: malformed GITHUB_REPOSITORY",
  NO_UNMERGED_FILES: "Merge reported conflicts but no unmerged files exist.",
  UNSUPPORTED_CONFLICTED_FILE: "Unsupported conflicted file",
  CONFLICTS_STILL_PRESENT: "Conflicts still present after resolution.",
  UNABLE_TO_READ_STAGE: "Unable to read stage",
  REQUIRED_MERGE_STAGES_MISSING: "Required merge stages are missing.",
  NO_PACKAGE_JSON_FOUND: "No package.json found",
  NO_EVENT_NAME_PROVIDED:
    "No event name provided. This command is designed to run in GitHub Actions.",
  PR_NUMBER_REQUIRED:
    "PR number is required when mode=single. Provide it via workflow input 'pr_number'.",
  INVALID_MODE: "Invalid mode: {mode}. Must be 'single' or 'all'.",
  UNSUPPORTED_EVENT_TYPE:
    "Unsupported event type. Supported events: pull_request_target, workflow_dispatch",
  FAILED_TO_FETCH_PRS: "Failed to fetch PRs",
  FAILED_TO_PROCESS_PR: "Failed to process PR",
  FAILED_TO_COMMENT_ON_PR: "Failed to comment on PR",
  FAILED_TO_CREATE_COMMENT: "Failed to create comment",
};
