import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { GluegunToolbox } from "gluegun";

export async function generateCronJobTemplate(
  toolbox: GluegunToolbox,
  jobName: string,
) {
  const targetDir = "packages/jobs/src/api/jobs";

  const { print, template } = toolbox;
  const jobDir = path.join(targetDir, jobName);

  if (fs.existsSync(jobDir)) {
    print.error(`Directory already exists: ${jobDir}`);
    process.exit(1);
  }

  fs.mkdirSync(jobDir, { recursive: true });
  print.info(`Created directory: ${jobDir}`);

  const routePath = path.join(jobDir, "route.ts");
  const testPath = path.join(jobDir, `${jobName}.test.ts`);

  await template.generate({
    template: "job-template.ejs",
    target: routePath,
    props: { jobName },
  });

  await template.generate({
    template: "job-test-template.ejs",
    target: testPath,
    props: { jobName },
  });

  print.info(`Generated cron-job template for: ${jobName}`);

  // Format the generated files with Prettier
  [routePath, testPath].forEach((file) => {
    const result = spawnSync("npx", ["prettier", "--write", file], {
      stdio: "inherit",
      shell: true,
    });

    if (result.error) {
      print.error(`Prettier failed for ${file}: ${result.error.message}`);
    }
  });
}
