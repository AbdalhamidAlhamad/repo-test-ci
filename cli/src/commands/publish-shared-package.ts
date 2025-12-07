import { GluegunCommand } from "gluegun";

const command: GluegunCommand = {
  name: "publish:canary",
  description:
    "Publish a canary version of the shared package if changes are detected",
  run: async (toolbox) => {
    const { system, print } = toolbox;

    const currentBranch = await system.run("git branch --show-current");
    if (currentBranch.trim() === "main") {
      print.info("⏭️  Skipping canary publish on main branch");
      return;
    }

    print.info("🚀 Starting canary publish check...");

    try {
      // Generate unique canary identifier using commit hash and timestamp
      const commitHash = (
        await system.run("git rev-parse --short HEAD")
      ).trim();
      const timestamp = Date.now();
      const preid = `canary.${commitHash}.${timestamp}`;

      print.info(`📦 Publishing canary version with identifier: ${preid}`);
      await system.run(
        `SKIP_HUSKY=1 npx lerna publish prerelease --yes --preid ${preid} --dist-tag canary --force-publish=@tajawal/shield-shared`,
      );

      print.success("✅ Successfully published canary version");
    } catch (error) {
      print.error(`❌ Failed to publish canary version: ${error}`);
      process.exit(1);
    }
  },
};

export default command;
