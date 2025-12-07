# Workflow Review: Auto-Resolve Publish Conflicts

## Critical Issues with `allowFailure: true` Default

### ⚠️ **CRITICAL: `allowFailure` defaults to `true`**

In `cli/src/utils/command.ts`, line 12:
```typescript
allowFailure = true,  // ⚠️ DANGEROUS DEFAULT
```

This means commands that fail will **silently return empty strings** instead of throwing errors, which can cause:
- Silent failures
- Incorrect behavior
- Hard-to-debug issues

---

## Line-by-Line Review

### GitHub Workflow (`.github/workflows/auto-resolve-publish-conflicts.yml`)

#### Lines 1-30: Workflow Configuration
✅ **OK** - Standard workflow setup

#### Lines 31-60: Job Steps
✅ **OK** - Standard setup steps

---

### Command Execution (`cli/src/utils/command.ts`)

#### Lines 5-61: `runCommand` Function
⚠️ **ISSUE**: `allowFailure = true` is the default (line 12)
- Commands that should fail will silently return `""`
- Only throws if `allowFailure: false` is explicitly set

---

### Conflict Resolver (`cli/src/utils/github-conflict-resolver.ts`)

#### Line 18: `git rev-parse HEAD`
```typescript
const originalHead = runCommand("git rev-parse HEAD").trim();
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If this fails, `originalHead` will be `""`
- Later comparisons will fail silently
- **Fix**: Add `allowFailure: false`

#### Line 46: `git merge --abort`
```typescript
runCommand("git merge --abort", {
  errorLevel: "warning",
});
```
✅ **OK** - Uses `errorLevel: "warning"`, which is appropriate for cleanup

#### Lines 54-55: Checkout PR Branch
```typescript
runCommand(`git fetch origin ${prInfo.headRef}`);
runCommand(`git checkout ${prInfo.headRef}`);
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If fetch fails, continues with stale data
- If checkout fails, continues on wrong branch
- **Fix**: Add `allowFailure: false` to both

#### Lines 64-66: Git Config
```typescript
runCommand('git config user.name "github-actions[bot]"');
runCommand('git config user.email "github-actions[bot]@users.noreply.github.com"');
```
❌ **BUG**: No `allowFailure: false`
- If config fails, commits will have wrong author
- **Fix**: Add `allowFailure: false` to both

#### Lines 76-91: Configure Git Remotes
```typescript
const remotesOutput = runCommand("git remote");
// ...
runCommand("git remote remove base");
runCommand(`git remote add base "${repoUrl}"`);
runCommand(`git fetch base "${prInfo.baseRef}"`);
```
❌ **CRITICAL BUGS**:
- Line 76: `git remote` - if fails, `remotes.includes("base")` check is wrong
- Line 84: `git remote remove base` - should use `errorLevel: "warning"` (might not exist)
- Line 90: `git remote add base` - if fails, merge will fail later
- Line 91: `git fetch base` - if fails, merge will use stale data
- **Fix**: 
  - Line 76: `allowFailure: false`
  - Line 84: Keep `errorLevel: "warning"` (already OK)
  - Lines 90-91: `allowFailure: false`

#### Line 99: Disable Git Hooks
```typescript
runCommand("git config core.hooksPath /dev/null", {
  errorLevel: "warning",
});
```
✅ **OK** - Uses `errorLevel: "warning"` appropriately

#### Lines 107-108: Merge Base Into Head
```typescript
runCommand(`git merge --no-commit --no-ff base/${prInfo.baseRef}`, {
  allowFailure: false,  // ✅ GOOD - explicitly set
});
```
✅ **OK** - Correctly uses `allowFailure: false`

#### Line 132: Get Conflicted Files
```typescript
const output = runCommand("git diff --name-only --diff-filter=U");
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If command fails, `output` will be `""`
- `files` array will be empty
- Will incorrectly think there are no conflicts
- **Fix**: Add `allowFailure: false`

#### Line 174: Checkout Base Version (CHANGELOG)
```typescript
runCommand(`git checkout --theirs "${file}"`);
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If checkout fails, file remains conflicted
- Merge will fail later
- **Fix**: Add `allowFailure: false`

#### Line 221: Stage Resolved Files
```typescript
runCommand(`git add ${args}`);
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If `git add` fails, files aren't staged
- Commit will fail or commit wrong state
- **Fix**: Add `allowFailure: false`

#### Line 231: Check Remaining Conflicts
```typescript
const remaining = runCommand("git diff --name-only --diff-filter=U");
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If command fails, `remaining` will be `""`
- Will incorrectly think conflicts are resolved
- **Fix**: Add `allowFailure: false`

#### Lines 249-250, 263-264: Check Staged Changes
```typescript
const stagedDiff = runCommand("git diff --cached --name-only").trim();
const workingTreeDiff = runCommand("git diff --name-only").trim();
// ...
const finalStagedDiff = runCommand("git diff --cached --name-only").trim();
const diffAgainstOriginal = runCommand(`git diff ${originalHead} --name-only`).trim();
```
❌ **BUGS**: No `allowFailure: false`
- If commands fail, comparisons will be wrong
- May incorrectly create empty commits or skip commits
- **Fix**: Add `allowFailure: false` to all

#### Line 257: Stage Working Tree Changes
```typescript
runCommand(`git add ${filesToStage}`);
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If staging fails, changes won't be committed
- **Fix**: Add `allowFailure: false`

#### Lines 278-282: Empty Commit and Push
```typescript
runCommand('git commit --no-verify --allow-empty -m "..."', { env });
runCommand("git push origin HEAD", { env });
```
❌ **CRITICAL BUGS**: No `allowFailure: false`
- If commit fails, merge state is broken
- If push fails, branch isn't updated
- **Fix**: Add `allowFailure: false` to both

#### Lines 311-315: Normal Commit and Push
```typescript
runCommand('git commit --no-verify -m "chore: auto-resolve publish conflicts"', { env });
runCommand("git push origin HEAD", { env });
```
❌ **CRITICAL BUGS**: No `allowFailure: false`
- If commit fails, merge state is broken
- If push fails, branch isn't updated
- **Fix**: Add `allowFailure: false` to both

---

### Package Resolver (`cli/src/utils/package-resolver.ts`)

#### Line 124: Stage package.json Before Regeneration
```typescript
runCommand(`git add "${packageJsonPath}"`, {
  errorLevel: "warning",
});
```
⚠️ **QUESTIONABLE**: Uses `errorLevel: "warning"`
- If staging fails, lockfile regeneration might use wrong package.json
- Consider `allowFailure: false` if this is critical

#### Lines 133-142: Cleanup Commands
```typescript
runCommand("rm -rf node_modules", {
  errorLevel: "warning",
});
```
✅ **OK** - Cleanup commands can fail safely

#### Line 148: npm install
```typescript
runCommand("npm install --package-lock-only --ignore-scripts --no-audit", {
  cwd,
});
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If npm install fails, lockfile won't be regenerated
- Merge will have incorrect lockfile
- **Fix**: Add `allowFailure: false`

#### Line 174: Stage Root package.json
```typescript
runCommand(`git add "${rootPackageJson}"`, {
  errorLevel: "warning",
});
```
⚠️ **QUESTIONABLE**: Same as line 124

#### Line 187: npm install (Root)
```typescript
runCommand("npm install --package-lock-only --ignore-scripts --no-audit");
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- Same issue as line 148
- **Fix**: Add `allowFailure: false`

#### Line 199: Read Git Stage
```typescript
const output = runCommand(`git show :${stage}:${filepath}`);
```
❌ **CRITICAL BUG**: No `allowFailure: false`
- If command fails, `output` will be `""`
- JSON.parse will fail or parse wrong data
- **Fix**: Add `allowFailure: false`

---

## Summary of Critical Issues

### 🔴 **Must Fix (Silent Failures)**

1. **Line 18** (`git rev-parse HEAD`) - Original HEAD will be wrong
2. **Lines 54-55** (fetch/checkout) - Wrong branch state
3. **Lines 64-66** (git config) - Wrong commit author
4. **Lines 76, 90-91** (git remote/fetch) - Wrong remote state
5. **Line 132** (get conflicted files) - Will miss conflicts
6. **Line 174** (checkout --theirs) - File remains conflicted
7. **Line 221** (git add) - Files not staged
8. **Line 231** (check remaining conflicts) - Will miss remaining conflicts
9. **Lines 249-250, 263-264** (diff commands) - Wrong change detection
10. **Line 257** (git add) - Changes not staged
11. **Lines 278-282, 311-315** (commit/push) - Merge state broken
12. **Line 148, 187** (npm install) - Lockfile not regenerated
13. **Line 199** (git show) - Wrong package.json data

### 🟡 **Consider Fixing**

1. **Line 124, 174** (git add with warning) - May cause issues if staging fails

---

## Recommended Fixes

Add `allowFailure: false` to all critical commands that must succeed for the workflow to function correctly.

