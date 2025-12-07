export interface CommandOptions {
  allowFailure?: boolean;
  captureOutput?: boolean;
  errorLevel?: ErrorLevel;
  label?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

type ErrorLevel = "error" | "warning";
