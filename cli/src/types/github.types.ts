export interface PackageJson {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundledDependencies?: string[];
  bundleDependencies?: string[];
}

export interface ConflictSummary {
  files: string[];
  hasPackageJsonConflict: boolean;
  hasPackageLockConflict: boolean;
}

export interface PRInfo {
  number: number;
  headRef: string;
  headRepoFull: string;
  baseRef: string;
  mergeableState: string;
  canPush: boolean;
  htmlUrl: string;
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface EventContext {
  eventName: string;
  mode: ConflictResolveMode;
  baseBranch: string;
  prNumber?: number;
  eventPrNumber?: number;
  eventBaseRef: string;
}

export type ConflictResolveMode = "single" | "all";
