import { GluegunCommand, GluegunToolbox } from "gluegun";
import { join } from "path";
import { statSync, existsSync } from "fs";

const cliStartCommand: GluegunCommand = {
  name: "shield-cli",
  run: async (toolbox: GluegunToolbox) => {
    const commandsDir = __dirname;
    const files = toolbox.filesystem.list(commandsDir);

    const commands = files
      .map((file: string) => {
        const fullPath = join(commandsDir, file);
        const isDir = statSync(fullPath).isDirectory();

        if (isDir) {
          if (existsSync(join(fullPath, `${file}.ts`))) return file;
          return null;
        }
        return file.replace(/\.(j|t)s$/, "");
      })
      .filter((cmd: string | null) => cmd && cmd !== "shield-cli");

    const { cmd } = await toolbox.prompt.ask([
      {
        type: "autocomplete",
        name: "cmd",
        message: "What do you want to do?",
        choices: commands.map(toolbox.strings.startCase),
        suggest(s, choices) {
          return choices.filter((choice) => {
            return choice.message.toLowerCase().includes(s.toLowerCase());
          });
        },
      },
    ]);

    let commandModule;
    if (existsSync(join(commandsDir, `${toolbox.strings.kebabCase(cmd)}.ts`))) {
      commandModule = require(`./${toolbox.strings.kebabCase(cmd)}.ts`);
    } else if (
      existsSync(
        join(
          commandsDir,
          toolbox.strings.kebabCase(cmd),
          `${toolbox.strings.kebabCase(cmd)}.ts`,
        ),
      )
    ) {
      commandModule = require(
        `./${toolbox.strings.kebabCase(
          cmd,
        )}/${toolbox.strings.kebabCase(cmd)}.ts`,
      );
    } else {
      toolbox.print.error(`Command "${cmd}" not found.`);
      return;
    }

    const run = commandModule.default?.run || commandModule.run;
    if (run) {
      await run(toolbox);
    } else {
      toolbox.print.error(`Command "${cmd}" does not export a run method.`);
    }
  },
};

module.exports = cliStartCommand;
