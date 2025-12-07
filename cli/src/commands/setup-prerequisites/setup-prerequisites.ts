import { GluegunCommand, print } from "gluegun";
import { finilize } from "./utils/finilize.utils";
import { setupAws } from "./utils/setup-aws.utils";
import { setupCredentials } from "./utils/setup-credentials.utils";
import { setupDesktop } from "./utils/setup-desktop.utils";
import { setupDocker } from "./utils/setup-docker.utils";
import { setupPrisma } from "./utils/setup-prisma.utils";

const command: GluegunCommand = {
  name: "setup:prerequisites",
  alias: "sp",
  run: async () => {
    print.highlight("\nSetting up prerequisites...\n");
    await setupCredentials();
    await setupDocker();
    await setupPrisma();
    await setupDesktop();
    await setupAws();
    await finilize();
  },
};
export default command;
