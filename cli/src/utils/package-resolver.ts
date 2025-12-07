import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import * as path from "path";
import { ConflictSummary, PackageJson } from "../types/github.types";
import { print } from "gluegun";
import { runCommand } from "./command";
import { Errors } from "../constants/errors";

const RANGE_PREFIX_REGEX = /^[\^~>=<]/;
const RANGE_PREFIX_REMOVE_REGEX = /^[\^~>=<]+\s*/;
const BASE_VERSION_REGEX = /^(\d+\.\d+\.\d+)/;
const PRERELEASE_REGEX = /^\d+\.\d+\.\d+-(.+)$/;

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
    });

    const cwd =
      lockFileDir === "."
        ? process.cwd()
        : path.join(process.cwd(), lockFileDir);

    runCommand("rm -rf node_modules", {
      cwd,
      errorLevel: "warning",
      label: "cleanup",
    });
    runCommand("rm -rf packages/*/node_modules", {
      cwd: process.cwd(),
      errorLevel: "warning",
      label: "cleanup",
    });

    print.info(
      `Running "npm install --package-lock-only --ignore-scripts --no-audit" in ${cwd}`,
    );

    runCommand("npm install --package-lock-only --ignore-scripts --no-audit", {
      cwd,
      allowFailure: false,
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
    });

    runCommand("rm -rf node_modules", {
      errorLevel: "warning",
      label: "cleanup",
    });
    runCommand("rm -rf packages/*/node_modules", {
      errorLevel: "warning",
      label: "cleanup",
    });

    runCommand("npm install --package-lock-only --ignore-scripts --no-audit", {
      allowFailure: false,
    });

    print.success("✅ Regenerated root package-lock.json");
  } catch (error) {
    print.warning(
      `Could not regenerate root package-lock.json: ${error}. Continuing...`,
    );
  }
}

function readStage(stage: number, filepath: string): PackageJson {
  try {
    const output = runCommand(`git show :${stage}:${filepath}`, {
      allowFailure: false,
    });

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
      // Only base branch has this dependency
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
  const base1 = extractBaseVersion(version1);
  const base2 = extractBaseVersion(version2);
  const prerelease1 = extractPrerelease(version1);
  const prerelease2 = extractPrerelease(version2);

  // Compare base versions first
  const baseComparison = compareVersions(base1, base2);

  if (baseComparison !== 0) {
    return baseComparison > 0 ? version1 : version2;
  }

  const prereleaseComparison = comparePrerelease(prerelease1, prerelease2);

  if (prereleaseComparison !== 0) {
    return prereleaseComparison > 0 ? version1 : version2;
  }

  // Versions are equal - prefer the one without range prefix (more specific)
  const hasRange1 = RANGE_PREFIX_REGEX.test(version1);
  const hasRange2 = RANGE_PREFIX_REGEX.test(version2);

  if (hasRange1 && !hasRange2) return version2;
  if (!hasRange1 && hasRange2) return version1;

  return version1;
}

function extractBaseVersion(version: string): string {
  const cleaned = version.replace(RANGE_PREFIX_REMOVE_REGEX, "").trim();
  const match = cleaned.match(BASE_VERSION_REGEX);
  return match ? match[1] : cleaned;
}

function extractPrerelease(version: string): string | null {
  const cleaned = version.replace(RANGE_PREFIX_REMOVE_REGEX, "").trim();
  const match = cleaned.match(PRERELEASE_REGEX);
  return match ? match[1] : null;
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  return 0;
}

function compareCanaryVersions(
  parts1: string[],
  parts2: string[],
): number | null {
  if (
    parts1.length < 3 ||
    parts2.length < 3 ||
    parts1[0]?.toLowerCase() !== "canary" ||
    parts2[0]?.toLowerCase() !== "canary"
  ) {
    return null;
  }

  const timestamp1 = Number(parts1[parts1.length - 1]);
  const timestamp2 = Number(parts2[parts2.length - 1]);

  if (!isNaN(timestamp1) && !isNaN(timestamp2)) {
    return timestamp1 > timestamp2 ? 1 : -1;
  }

  if (parts1.length >= 2 && parts2.length >= 2) {
    const hash1 = parts1[1];
    const hash2 = parts2[1];
    const hashCompare = hash1.localeCompare(hash2);
    if (hashCompare !== 0) return hashCompare > 0 ? 1 : -1;
  }

  return null;
}

function comparePrerelease(
  prerelease1: string | null,
  prerelease2: string | null,
): number {
  if (!prerelease1 && !prerelease2) return 0;
  if (!prerelease1) return 1;
  if (!prerelease2) return -1;

  const parts1 = prerelease1.split(".");
  const parts2 = prerelease2.split(".");

  const canaryComparison = compareCanaryVersions(parts1, parts2);
  
  if (canaryComparison) {
    return canaryComparison;
  }

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i];
    const part2 = parts2[i];

    if (!part1 && !part2) continue;
    if (!part1) return -1;
    if (!part2) return 1;

    const num1 = Number(part1);
    const num2 = Number(part2);

    if (!isNaN(num1) && !isNaN(num2)) {
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
      continue;
    }

    const order: Record<string, number> = {
      alpha: 1,
      beta: 2,
      rc: 3,
      canary: 0,
    };
    const order1 = order[part1.toLowerCase()];
    const order2 = order[part2.toLowerCase()];

    if (order1 !== order2) {
      return order1 > order2 ? 1 : -1;
    }

    const strCompare = part1.localeCompare(part2);
    if (strCompare !== 0) return strCompare > 0 ? 1 : -1;
  }

  return 0;
}
