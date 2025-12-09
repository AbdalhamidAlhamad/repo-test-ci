import { execSync, ExecSyncOptions } from "child_process";
import { CommandOptions } from "../types/command.types";
import { print } from "gluegun";

export function runCommand(
  command: string,
  options: CommandOptions = {},
): string {
  const {
    cwd,
    env,
    throwOnFailure = true,
    captureOutput = true,
    errorLevel = "error",
    label = command.split(" ")[0],
  } = options;

  const location = cwd ? ` (cwd: ${cwd})` : "";

  print.info(`[${label}] $ ${command}${location}`);

  const execOptions: ExecSyncOptions = {
    cwd,
    env,
    stdio: captureOutput ? "pipe" : "inherit",
    encoding: captureOutput ? "utf-8" : undefined,
  };

  try {
    const result = execSync(command, execOptions);

    if (!captureOutput) {
      return "";
    }

    return result.toString();
  } catch (e) {
    const status = e?.status ?? "unknown";
    const stdout = e?.stdout?.toString() ?? "";
    const stderr = e?.stderr?.toString() ?? "";

    const logFn = errorLevel === "warning" ? print.warning : print.error;

    logFn(
      `[${label}] Command failed with exit code ${status}: ${command}${location}`,
    );

    if (stdout) {
      logFn(`[${label}] stdout:\n${stdout}`);
    }
    if (stderr) {
      logFn(`[${label}] stderr:\n${stderr}`);
    }

    if (!throwOnFailure) {
      return "";
    }

    throw e;
  }
}
