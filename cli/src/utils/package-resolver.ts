import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import * as path from "path";
import semver from "semver";
import { ConflictSummary, PackageJson } from "../types/github.types";
import { print } from "gluegun";
import { runCommand } from "./command";
import { Errors } from "../constants/errors";

const RANGE_PREFIX_REGEX = /^[\^~>=<]/;
const RANGE_PREFIX_REMOVE_REGEX = /^[\^~>=<]+\s*/;

export async function mergePackageJson(filepath: string): Promise<void> {
  const PR_STAGE = 2;
  const BASE_STAGE = 3;
  const prPackage = readStage(PR_STAGE, filepath);
  const basePackage = readStage(BASE_STAGE, filepath);

  if (!prPackage || !basePackage) {
    throw new Error(Errors.REQUIRED_MERGE_STAGES_MISSING);
  }

  const mergedPackage: PackageJson = JSON.parse(JSON.stringify(prPackage));

  const latestVersion = getLatestVersion(
    prPackage.version,
    basePackage.version,
  );
  const versionChanged =
    latestVersion !== prPackage.version ||
    latestVersion !== basePackage.version;

  if (versionChanged) {
    print.info(
      `Package version: PR="${prPackage.version}" vs Base="${basePackage.version}" → "${latestVersion}"`,
    );
  }
  mergedPackage.version = latestVersion;

  const dependencyFields = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];

  for (const field of dependencyFields) {
    const mergedBlock = mergeDependencyBlock(
      prPackage[field],
      basePackage[field],
    );

    if (mergedBlock) {
      mergedPackage[field] = mergedBlock;
    } else {
      delete mergedPackage[field];
    }
  }

  const content = JSON.stringify(mergedPackage, null, 2) + "\n";
  writeFileSync(filepath, content, "utf8");
}

export async function regenerateLockfilesIfNeeded(
  conflicts: ConflictSummary,
): Promise<void> {
  const { files, hasPackageJsonConflict, hasPackageLockConflict } = conflicts;

  if (!hasPackageJsonConflict && !hasPackageLockConflict) {
    return;
  }

  const packageLockFiles = files.filter((file) =>
    file.includes("package-lock.json"),
  );

  for (const lockFile of packageLockFiles) {
    regenerateLockfile(lockFile);
  }

  if (hasPackageJsonConflict && !hasPackageLockConflict) {
    const rootPackageJson = files.find(
      (file) => file.endsWith("package.json") && !file.includes("/"),
    );
    if (rootPackageJson) {
      regenerateRootLockfile(rootPackageJson);
    }
  }
}

function regenerateLockfile(lockFile: string): void {
  try {
    print.info(`Generating fresh ${lockFile}...`);

    const lockFileDir = path.dirname(lockFile) || ".";
    const packageJsonPath = path.join(lockFileDir, "package.json");

    if (!existsSync(packageJsonPath)) {
      throw new Error(
        `${Errors.NO_PACKAGE_JSON_FOUND}: ${lockFile} at ${packageJsonPath}`,
      );
    }

    try {
      const pkgJsonContent = readFileSync(packageJsonPath, "utf-8");
      JSON.parse(pkgJsonContent);
    } catch (error) {
      print.error(
        `package.json at ${packageJsonPath} is invalid JSON: ${error}`,
      );
      throw error;
    }

    try {
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    } catch (error) {
      print.warning(
        `Could not remove existing lock file ${lockFile}, continuing: ${error}`,
      );
    }

    runCommand(`git add "${packageJsonPath}"`, {
      errorLevel: "warning",
      throwOnFailure: false,
    });

    const cwd =
      lockFileDir === "."
        ? process.cwd()
        : path.join(process.cwd(), lockFileDir);

    runCommand("rm -rf node_modules", {
      cwd,
      errorLevel: "warning",
      label: "cleanup",
      throwOnFailure: false,
    });
    runCommand("rm -rf packages/*/node_modules", {
      cwd: process.cwd(),
      errorLevel: "warning",
      label: "cleanup",
      throwOnFailure: false,
    });

    print.info(
      `Running "npm install --package-lock-only --ignore-scripts --no-audit" in ${cwd}`,
    );

    runCommand("npm install --package-lock-only --ignore-scripts --no-audit", {
      cwd,
    });

    print.success(
      `✅ Generated fresh ${lockFile} (based on resolved ${packageJsonPath})`,
    );
  } catch (error) {
    print.error(`Failed to generate ${lockFile}: ${error}`);
    try {
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    } catch (cleanupError) {
      print.warning(`Could not clean up ${lockFile}: ${cleanupError}`);
    }
    throw error;
  }
}

function regenerateRootLockfile(rootPackageJson: string): void {
  try {
    print.info(
      "Regenerating root package-lock.json to match resolved package.json...",
    );

    runCommand(`git add "${rootPackageJson}"`, {
      errorLevel: "warning",
      throwOnFailure: false,
    });

    runCommand("rm -rf node_modules", {
      errorLevel: "warning",
      label: "cleanup",
      throwOnFailure: false,
    });
    runCommand("rm -rf packages/*/node_modules", {
      errorLevel: "warning",
      label: "cleanup",
      throwOnFailure: false,
    });

    runCommand("npm install --package-lock-only --ignore-scripts --no-audit");

    print.success("✅ Regenerated root package-lock.json");
  } catch (error) {
    print.warning(
      `Could not regenerate root package-lock.json: ${error}. Continuing...`,
    );
  }
}

function readStage(stage: number, filepath: string): PackageJson {
  try {
    const output = runCommand(`git show :${stage}:${filepath}`);

    return JSON.parse(output);
  } catch (error) {
    throw new Error(
      `${Errors.UNABLE_TO_READ_STAGE}: ${stage} for ${filepath}: ${error}`,
    );
  }
}

function sortObject(
  input: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!input) return undefined;

  return Object.fromEntries(
    Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function mergeDependencyBlock(
  prBlock?: Record<string, string>,
  baseBlock?: Record<string, string>,
): Record<string, string> | undefined {
  if (!prBlock && !baseBlock) return undefined;

  const result = { ...(prBlock || {}) };

  if (!baseBlock) {
    return sortObject(result);
  }

  for (const [name, baseVersion] of Object.entries(baseBlock)) {
    const prVersion = result[name];
    if (!prVersion) {
      result[name] = baseVersion;
      continue;
    }

    const latestVersion = getLatestVersion(prVersion, baseVersion);
    const versionChanged =
      latestVersion !== prVersion || latestVersion !== baseVersion;

    if (versionChanged) {
      print.info(
        `  ${name}: PR="${prVersion}" vs Base="${baseVersion}" → "${latestVersion}"`,
      );
    }
    result[name] = latestVersion;
  }

  return sortObject(result);
}

function getLatestVersion(version1: string, version2: string): string {
  const cleaned1 = version1.replace(RANGE_PREFIX_REMOVE_REGEX, "").trim();
  const cleaned2 = version2.replace(RANGE_PREFIX_REMOVE_REGEX, "").trim();

  const parsed1 = semver.parse(cleaned1) || semver.coerce(cleaned1) || null;
  const parsed2 = semver.parse(cleaned2) || semver.coerce(cleaned2) || null;

  if (parsed1 && !parsed2) return version1;
  if (!parsed1 && parsed2) return version2;

  if (!parsed1 && !parsed2) return version1;

  if (
    isCanaryWithTimestamp(parsed1.prerelease) &&
    isCanaryWithTimestamp(parsed2.prerelease)
  ) {
    const tsCmp = compareCanaryTimestamp(
      parsed1.prerelease,
      parsed2.prerelease,
    );
    if (tsCmp > 0) return version1;
    if (tsCmp < 0) return version2;
  }

  if (semver.gt(parsed1, parsed2)) return version1;
  if (semver.lt(parsed1, parsed2)) return version2;

  const hasRange1 = RANGE_PREFIX_REGEX.test(version1);
  const hasRange2 = RANGE_PREFIX_REGEX.test(version2);

  if (hasRange1 && !hasRange2) return version2;
  if (!hasRange1 && hasRange2) return version1;

  return version1;
}

function isCanaryWithTimestamp(
  prerelease: readonly (string | number)[],
): boolean {
  if (!prerelease.length) return false;
  if (String(prerelease[0]).toLowerCase() !== "canary") return false;

  return prerelease.some((part) => /^\d{10,}$/.test(String(part)));
}

function compareCanaryTimestamp(
  prerelease1: readonly (string | number)[],
  prerelease2: readonly (string | number)[],
): number {
  const ts1 = extractNumericTimestamp(prerelease1);
  const ts2 = extractNumericTimestamp(prerelease2);

  if (ts1 == null || ts2 == null) return 0;
  if (ts1 > ts2) return 1;
  if (ts1 < ts2) return -1;
  return 0;
}

function extractNumericTimestamp(
  parts: readonly (string | number)[],
): number | null {
  let best: number | null = null;

  for (const part of parts) {
    const str = String(part);
    if (!/^\d+$/.test(str)) continue;

    const value = Number(str);
    if (!Number.isFinite(value)) continue;

    if (best === null || str.length > String(best).length) {
      best = value;
    }
  }

  return best;
}
