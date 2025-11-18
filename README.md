This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Auto-resolve publish conflicts

Shared package publishing can rewrite `CHANGELOG.md`, `package-lock.json`, and `package.json` files, which often generates merge conflicts for other open pull requests. The repository now includes the `Auto Resolve Publish Conflicts` workflow (`.github/workflows/auto-resolve-publish-conflicts.yml`) to keep those conflicts unblocked automatically.

### What the workflow does

- Watches every pull request via `pull_request_target` events and runs again whenever a PR is opened, reopened, or synchronized.
- Detects merge conflicts and exits unless all conflicted files are either `CHANGELOG.md`, `package-lock.json`, or `package.json`.
- Resolves specific files with deterministic rules:
  - `CHANGELOG.md` and `package-lock.json`: always take the base-branch version.
  - `package.json`: keep the feature-branch fields, force the base version string, and merge dependency blocks so that shared entries use the base version while unique dependencies from both branches are preserved.
- Creates a merge commit with message `chore: auto-resolve publish conflicts`, pushes it to the PR branch (same-repo branches only), and leaves a PR comment showing the affected files.

### Manual runs after publishing shared packages

When a shared package is published and you need to refresh every open PR:

1. Navigate to **Actions → Auto Resolve Publish Conflicts**.
2. Click **Run workflow**.
3. Choose `all` for **Mode**, and set **Base branch** (defaults to `main`).
4. Start the run—the workflow dynamically fans out to each open PR on that base branch and applies the same conflict rules.

Use the `single` mode (providing a `pr_number`) if you only want to refresh one PR on demand.
