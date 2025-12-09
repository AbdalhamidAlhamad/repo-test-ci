export interface CommandOptions {
  throwOnFailure?: boolean;
  captureOutput?: boolean;
  errorLevel?: ErrorLevel;
  label?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

type ErrorLevel = "error" | "warning";
