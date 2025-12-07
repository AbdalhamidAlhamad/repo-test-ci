import { print, system } from "gluegun";

export async function setupDocker() {
  const dockerSpinner = print.spin("Setting up Docker...\n");
  try {
    await system.run("docker info");
    dockerSpinner.succeed("Docker setup done...\n");
  } catch (error) {
    dockerSpinner.fail("Docker setup failed!\n");
    process.exit(0);
  }
  dockerSpinner.stop();
}
