import { print, system, filesystem } from "gluegun";
import * as os from "os";
import * as path from "path";

export async function setupAws() {
  await setupDefaultProfile();
  await setupProductionProfile();
}

async function setupDefaultProfile() {
  const awsSpinner = print.spin("Setting up aws default profile...\n");
  try {
    // Ensure ~/.aws directory exists
    const awsDir = path.join(os.homedir(), ".aws");
    const configPath = path.join(awsDir, "config");

    if (!filesystem.exists(awsDir)) {
      filesystem.dir(awsDir);
    }

    // Read existing config or create empty string
    let configContent = filesystem.exists(configPath)
      ? filesystem.read(configPath) || ""
      : "";

    // Configuration values
    const profileName = "default";
    const region = "eu-west-1";
    const output = "json";
    const ssoSessionName = "default-sso";

    // Check if profile already exists
    const hasProfile =
      configContent.includes(`[profile ${profileName}]`) ||
      configContent.includes(`[${profileName}]`);
    const hasSsoSession = configContent.includes(
      `[sso-session ${ssoSessionName}]`,
    );

    awsSpinner.text = "Configuring AWS profile...";

    // Add or update default profile if it doesn't exist
    if (!hasProfile) {
      const profileConfig = `\n[${profileName}]
sso_session = ${ssoSessionName}
sso_account_id = 797036517683
sso_role_name = shield-nonprod-buckets
region = ${region}
output = ${output}\n`;
      configContent += profileConfig;
      print.info("Adding default AWS profile configuration...");
    }

    // Add SSO session if it doesn't exist
    if (!hasSsoSession) {
      awsSpinner.stop();

      // Prompt for SSO start URL
      const readline = require("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ssoStartUrl = await new Promise<string>((resolve) => {
        rl.question(
          "Enter your AWS SSO start URL [https://d-93671283e1.awsapps.com/start]: ",
          (answer) => {
            rl.close();
            resolve(answer.trim() || "https://d-93671283e1.awsapps.com/start");
          },
        );
      });

      const ssoSessionConfig = `\n[sso-session ${ssoSessionName}]
sso_start_url = ${ssoStartUrl}
sso_region = ${region}
sso_registration_scopes = sso:account:access\n`;
      configContent += ssoSessionConfig;
      print.info("Adding AWS SSO session configuration...");
      awsSpinner.start();
    }

    // Write back to config file if changes were made
    if (!hasProfile || !hasSsoSession) {
      filesystem.write(configPath, configContent);
      awsSpinner.text = "AWS configuration updated...";
      print.success("AWS configuration file updated");
    } else {
      print.info("AWS profile already configured");
    }

    // Stop spinner before interactive command
    awsSpinner.stop();

    // Run AWS SSO login
    print.info("Logging in to AWS SSO with default profile...");
    print.info(`Running: aws sso login --profile ${profileName}`);

    const loginResult = await system.spawn(
      `aws sso login --profile ${profileName}`,
      {
        stdio: "inherit",
        shell: true,
      },
    );

    if (loginResult.status !== 0) {
      throw new Error(`AWS SSO login failed with status ${loginResult.status}`);
    }

    print.success("AWS default profile setup done");
  } catch (error) {
    console.log("error", error);
    print.error("Aws default profile setup failed!\n");
    process.exit(1);
  }
}

async function setupProductionProfile() {
  const awsSpinner = print.spin("Setting up AWS production profile...\n");
  try {
    // Ensure ~/.aws directory exists
    const awsDir = path.join(os.homedir(), ".aws");
    const configPath = path.join(awsDir, "config");

    if (!filesystem.exists(awsDir)) {
      filesystem.dir(awsDir);
    }

    // Read existing config or create empty string
    let configContent = filesystem.exists(configPath)
      ? filesystem.read(configPath) || ""
      : "";

    // Configuration values
    const profileName = "shield-prod-buckets-820808869900";
    const region = "eu-west-1";
    const output = "json";
    const ssoSessionName = "prod";

    // Check if profile already exists
    const hasProfile = configContent.includes(`[profile ${profileName}]`);
    const hasSsoSession = configContent.includes(
      `[sso-session ${ssoSessionName}]`,
    );

    awsSpinner.text = "Configuring AWS production profile...";

    // Add or update production profile if it doesn't exist
    if (!hasProfile) {
      const profileConfig = `\n[profile ${profileName}]
sso_session = ${ssoSessionName}
sso_account_id = 820808869900
sso_role_name = shield-prod-buckets
region = ${region}
output = ${output}\n`;
      configContent += profileConfig;
      print.info("Adding production AWS profile configuration...");
    }

    // Add SSO session if it doesn't exist
    if (!hasSsoSession) {
      awsSpinner.stop();

      // Prompt for SSO start URL
      const readline = require("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ssoStartUrl = await new Promise<string>((resolve) => {
        rl.question(
          "Enter your AWS SSO start URL for production [https://d-93671283e1.awsapps.com/start]: ",
          (answer) => {
            rl.close();
            resolve(answer.trim() || "https://d-93671283e1.awsapps.com/start");
          },
        );
      });

      const ssoSessionConfig = `\n[sso-session ${ssoSessionName}]
sso_start_url = ${ssoStartUrl}
sso_region = ${region}
sso_registration_scopes = sso:account:access\n`;
      configContent += ssoSessionConfig;
      print.info("Adding AWS SSO session configuration for production...");
      awsSpinner.start();
    }

    // Write back to config file if changes were made
    if (!hasProfile || !hasSsoSession) {
      filesystem.write(configPath, configContent);
      awsSpinner.text = "AWS production configuration updated...";
      print.success("AWS production configuration file updated");
    } else {
      print.info("AWS production profile already configured");
    }

    // Stop spinner before interactive command
    awsSpinner.stop();

    // Verify the profile exists in the config
    print.info(`Verifying profile '${profileName}' exists in ${configPath}...`);
    const finalConfig = filesystem.read(configPath) || "";
    if (!finalConfig.includes(`[profile ${profileName}]`)) {
      throw new Error(`Profile ${profileName} not found in AWS config file`);
    }

    // Run AWS SSO login
    print.info("Logging in to AWS SSO with production profile...");
    print.info(`Running: aws sso login --profile ${profileName}`);

    const loginResult = await system.spawn(
      `aws sso login --profile ${profileName}`,
      {
        stdio: "inherit",
        shell: true,
      },
    );

    if (loginResult.status !== 0) {
      throw new Error(`AWS SSO login failed with status ${loginResult.status}`);
    }

    print.success("AWS production profile setup done");

    // Set environment variables for production
    process.env.AWS_PROFILE = profileName;
    process.env.SHIELD_AWS_BUCKET_NAME = "almosafer-shield-prod";
  } catch (error) {
    console.log("error", error);
    print.error("AWS production profile setup failed!\n");
    process.exit(1);
  }
}
