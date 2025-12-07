import { existsSync, readdirSync, statSync } from "fs";
import { build } from "gluegun";
import { join } from "path";

/**
 * Create the cli and kick it off
 */
async function run(argv) {
  const tSModuleAlias = require("@momothepug/tsmodule-alias");

  // make it work using custom alias before execution
  tSModuleAlias.use({
    "@": __dirname + "../../../",
  });

  const commandsDir = join(__dirname, "commands");
  const commandsPaths = readdirSync(commandsDir)
    .map((file) => {
      const commandPath = join(commandsDir, file);
      const isDir = statSync(commandPath).isDirectory();

      if (isDir) {
        const tsPath = join(commandPath, `${file}.ts`);
        const jsPath = join(commandPath, `${file}.js`);
        if (existsSync(tsPath)) return tsPath;
        if (existsSync(jsPath)) return jsPath;
        return null;
      }

      return commandPath;
    })
    .filter(Boolean);

  // create a CLI runtime
  const cli = build()
    .brand("shield-cli")
    .src(__dirname, { commandFilePattern: commandsPaths })
    .plugins("./node_modules", { matching: "shield-cli-*", hidden: true })
    .help() // provides default for help, h, --help, -h
    .version() // provides default for version, v, --version, -v
    .create();
  // enable the following method if you'd like to skip loading one of these core extensions
  // this can improve performance if they're not necessary for your project:
  // .exclude(['meta', 'strings', 'print', 'filesystem', 'semver', 'system', 'prompt', 'http', 'template', 'patching', 'package-manager'])
  // and run it
  const toolbox = await cli.run(argv);

  // send it back (for testing, mostly)
  return toolbox;
}

module.exports = { run };
