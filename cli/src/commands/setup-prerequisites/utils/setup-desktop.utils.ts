import { print, system } from "gluegun";

export async function setupDesktop() {
  const desktopAppSpinner = print.spin("Setting up desktop application...\n");
  try {
    await system.run("cd ./packages/desktop && npx playwright install");
    desktopAppSpinner.succeed("Desktop application setup done...\n");
  } catch (error) {
    desktopAppSpinner.fail("Desktop application setup failed!\n");
    process.exit(0);
  }
  desktopAppSpinner.stop();
}
