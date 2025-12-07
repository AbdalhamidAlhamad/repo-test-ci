import { Octokit } from "@octokit/rest";
import { GitHubConfig } from "../types/github.types";

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.owner;
    this.repo = config.repo;
  }

  async getPullRequest(prNumber: number) {
    const response = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return response.data;
  }

  async listOpenPullRequests(baseBranch: string) {
    const prs = await this.octokit.paginate(this.octokit.rest.pulls.list as any, {
      owner: this.owner,
      repo: this.repo,
      state: "open",
      base: baseBranch,
      per_page: 100,
    });
    return prs;
  }

  async listOpenPullRequestNumbers(baseBranch: string): Promise<number[]> {
    const prs = await this.listOpenPullRequests(baseBranch);
    return prs.map((pr : any) => pr.number);
  }

  async createComment(prNumber: number, body: string) {
    return this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      body,
    });
  }

  async waitForMergeableState(
    prNumber: number,
    maxAttempts = 15,
    delayMs = 2000,
  ) {
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const pr = await this.getPullRequest(prNumber);

      if (pr.mergeable_state && pr.mergeable_state !== "unknown") {
        return pr;
      }

      if (attempt < maxAttempts - 1) {
        await wait(delayMs);
      }
    }

    return this.getPullRequest(prNumber);
  }

  async getHeadCommitSummaryForPr(prNumber: number): Promise<{
    sha: string;
    files: string[];
  }> {
    const pr = await this.getPullRequest(prNumber);
    const sha = pr.head.sha;

    const commit = await this.octokit.rest.repos.getCommit({
      owner: this.owner,
      repo: this.repo,
      ref: sha,
    });

    const files =
      commit.data.files?.map((file) => file.filename).filter(Boolean) ?? [];

    return { sha, files };
  }
}
