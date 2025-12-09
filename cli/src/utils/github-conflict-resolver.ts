import { print } from "gluegun";
import { ConflictSummary, PRInfo } from "../types/github.types";
import {
  mergePackageJson,
  regenerateLockfilesIfNeeded,
} from "./package-resolver";
import { Errors } from "../constants/errors";
import { runCommand } from "./command";

export async function resolveConflictsForPR(prInfo: PRInfo): Promise<boolean> {
  try {
    checkoutPrBranch(prInfo);
    configureGitUser();
    configureGitRemotes(prInfo);
    disableGitHooks();

    const originalHead = runCommand("git rev-parse HEAD").trim();

    const hadConflicts = mergeBaseIntoHead(prInfo);
    if (!hadConflicts) {
      return false;
    }

    const conflicts = getConflictedFiles();

    await handleSupportedConflicts(conflicts);
    await regenerateLockfilesIfNeeded(conflicts);
    stageResolvedFiles(conflicts);
    ensureNoRemainingConflicts();
    const hasChanges = ensureHasStagedChanges(originalHead);
    if (hasChanges) {
      commitAndPush();
    }

    return true;
  } catch (error) {
    print.error(
      `Failed to resolve publish conflicts for PR #${prInfo.number}: ${error}`,
    );
    return false;
  }
}

function abortMergeSafely(): void {
  runCommand("git merge --abort", {
    errorLevel: "warning",
    throwOnFailure: false,
  });
}

function checkoutPrBranch(prInfo: PRInfo): void {
  try {
    print.info(`Checking out PR branch: ${prInfo.headRef}`);
    runCommand(`git fetch origin ${prInfo.headRef}`);
    runCommand(`git checkout ${prInfo.headRef}`);
  } catch (error) {
    print.error(`Failed to checkout PR branch: ${error}`);
    throw error;
  }
}

function configureGitUser(): void {
  try {
    runCommand('git config user.name "github-actions[bot]"');
    runCommand(
      'git config user.email "github-actions[bot]@users.noreply.github.com"',
    );
  } catch (error) {
    print.error(`Failed to configure git user: ${error}`);
    throw error;
  }
}

function configureGitRemotes(prInfo: PRInfo): void {
  try {
    const remotesOutput = runCommand("git remote");

    const remotes = remotesOutput
      .trim()
      .split("\n")
      .filter((r) => r.length > 0);

    if (remotes.includes("base")) {
      runCommand("git remote remove base", {
        errorLevel: "warning",
        throwOnFailure: false,
      });
    }

    const [owner, repo] = prInfo.headRepoFull.split("/");
    const repoUrl = `https://github.com/${owner}/${repo}.git`;

    runCommand(`git remote add base "${repoUrl}"`);
    runCommand(`git fetch base "${prInfo.baseRef}"`);
  } catch (error) {
    print.error(`Failed to configure git remotes: ${error}`);
    throw error;
  }
}

function disableGitHooks(): void {
  runCommand("git config core.hooksPath /dev/null", {
    errorLevel: "warning",
  });
  print.info("Disabled git hooks for this run (core.hooksPath=/dev/null).");
}

function mergeBaseIntoHead(prInfo: PRInfo): boolean {
  try {
    runCommand(`git merge --no-commit --no-ff base/${prInfo.baseRef}`);
    print.info(
      "Merge completed without conflicts. Aborting because there is nothing to resolve.",
    );
    abortMergeSafely();
    return false;
  } catch (error) {
    const status = error?.status;

    if (status === 0) {
      print.info(
        "Merge reported success but an error was thrown. Aborting merge.",
      );
      abortMergeSafely();
      return false;
    }

    return true;
  }
}

function getConflictedFiles(): ConflictSummary {
  try {
    const output = runCommand("git diff --name-only --diff-filter=U");

    const files = output
      .trim()
      .split("\n")
      .filter((file) => file.length > 0);

    if (files.length === 0) {
      print.info("Git reported conflicts but no unmerged files were found.");
      abortMergeSafely();
      throw new Error(Errors.NO_UNMERGED_FILES);
    }

    print.info("Conflicted files:");
    files.forEach((file) => print.info(`  - ${file}`));

    const hasPackageJsonConflict = files.some((f) =>
      f.includes("package.json"),
    );
    const hasPackageLockConflict = files.some((f) =>
      f.includes("package-lock.json"),
    );

    return { files, hasPackageJsonConflict, hasPackageLockConflict };
  } catch (error) {
    print.error(`Failed to get conflicted files: ${error}`);
    abortMergeSafely();
    throw error;
  }
}

async function handleSupportedConflicts(
  conflicts: ConflictSummary,
): Promise<void> {
  for (const file of conflicts.files) {
    // Lockfiles are handled separately via regeneration
    if (file.includes("package-lock.json")) {
      continue;
    }

    if (file.includes("CHANGELOG.md")) {
      try {
        runCommand(`git checkout --theirs "${file}"`);
        print.success(`✅ Resolved ${file} (using base branch version)`);
        continue;
      } catch (error) {
        print.error(`Failed to resolve ${file}: ${error}`);
        abortMergeSafely();
        throw error;
      }
    }

    if (file.includes("package.json")) {
      try {
        await mergePackageJson(file);
        print.success(`✅ Resolved ${file} (smart merge)`);
        continue;
      } catch (error) {
        print.error(`Failed to resolve ${file}: ${error}`);
        abortMergeSafely();
        throw error;
      }
    }

    print.warning(
      `⚠️  Skipping ${file} - not within the supported auto-resolve list.`,
    );
    print.error(
      "Found unsupported conflicted files. Aborting without changes.",
    );
    abortMergeSafely();
    throw new Error(`${Errors.UNSUPPORTED_CONFLICTED_FILE}: ${file}`);
  }
}

function stageResolvedFiles(conflicts: ConflictSummary): void {
  try {
    const filesToStage = [...conflicts.files];

    if (conflicts.hasPackageJsonConflict && !conflicts.hasPackageLockConflict) {
      const rootPackageJson = conflicts.files.find(
        (file) => file.endsWith("package.json") && !file.includes("/"),
      );
      if (rootPackageJson && !filesToStage.includes("package-lock.json")) {
        filesToStage.push("package-lock.json");
      }
    }

    const args = filesToStage.map((f) => `"${f}"`).join(" ");
    runCommand(`git add ${args}`);
  } catch (error) {
    print.error(`Failed to stage files: ${error}`);
    abortMergeSafely();
    throw error;
  }
}

function ensureNoRemainingConflicts(): void {
  try {
    const remaining = runCommand("git diff --name-only --diff-filter=U");

    if (remaining.trim().length > 0) {
      print.error("Conflicts remain after running the resolver.");
      throw new Error(Errors.CONFLICTS_STILL_PRESENT);
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      print.error(`Failed to check remaining conflicts: ${error}`);
      throw error;
    }
    throw error;
  }
}

function ensureHasStagedChanges(originalHead: string): boolean {
  try {
    const stagedDiff = runCommand("git diff --cached --name-only").trim();
    const workingTreeDiff = runCommand("git diff --name-only").trim();

    if (workingTreeDiff && !stagedDiff.includes(workingTreeDiff)) {
      const changedFiles = workingTreeDiff.split("\n").filter(Boolean);
      const filesToStage = changedFiles.map((f) => `"${f}"`).join(" ");
      if (filesToStage) {
        runCommand(`git add ${filesToStage}`);
        print.info(`Staged working tree changes: ${changedFiles.join(", ")}`);
      }
    }

    const finalStagedDiff = runCommand("git diff --cached --name-only").trim();
    const diffAgainstOriginal = runCommand(
      `git diff ${originalHead} --name-only`,
    ).trim();

    if (!finalStagedDiff && !diffAgainstOriginal) {
      print.info(
        "After resolving conflicts, the resolved state exactly matches the PR branch. No changes needed.",
      );
      print.info(
        "Completing merge with empty commit to update branch pointer and mark conflicts as resolved.",
      );
      const env = { ...process.env, SKIP_HUSKY: "1" };
      runCommand(
        'git commit --no-verify --allow-empty -m "chore: auto-resolve publish conflicts (resolved state matches branch)"',
        { env },
      );
      runCommand("git push origin HEAD", { env });
      print.success(
        "✅ Completed merge (resolved state matches branch, but merge is now complete)",
      );
      return false;
    }

    if (finalStagedDiff && !diffAgainstOriginal) {
      print.warning(
        "Staged changes exist but match original branch. Completing merge anyway.",
      );
    }

    return true;
  } catch (error) {
    if (error instanceof Error && error.message === Errors.NO_STAGED_CHANGES) {
      throw error;
    }

    print.error(`Failed to check staged changes: ${error}`);
    throw error;
  }
}

function commitAndPush(): void {
  try {
    const env = { ...process.env, SKIP_HUSKY: "1" };

    runCommand(
      'git commit --no-verify -m "chore: auto-resolve publish conflicts"',
      { env },
    );
    runCommand("git push origin HEAD", { env });

    print.success("✅ Successfully resolved and pushed conflicts");
  } catch (error) {
    print.error(`Failed to commit/push: ${error}`);
    throw error;
  }
}
