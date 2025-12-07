import { filesystem, print, prompt } from "gluegun";

export async function setupCredentials() {
  await setupEnv();
  await setupCredentialsDB();
}

async function setupEnv() {
  await copyEnvFiles();
  try {
    await setupUserEmail();
  } catch (error) {
    process.exit(0);
  }
}

async function setupCredentialsDB() {
  const setupCredentialsDBSpinner = print.spin("Setting up db credentials...");
  try {
    const credentialsLocal = await filesystem.existsAsync(
      filesystem.path(
        "packages",
        "shared",
        "src",
        "db",
        "prisma",
        "credentials.json",
      ),
    );
    if (!credentialsLocal) {
      filesystem.copy(
        filesystem.path(
          "packages",
          "shared",
          "src",
          "db",
          "prisma",
          "credentials.example.json",
        ),
        filesystem.path(
          "packages",
          "shared",
          "src",
          "db",
          "prisma",
          "credentials.json",
        ),
      );
    }
    setupCredentialsDBSpinner.succeed("DB credentials setup done...\n");
  } catch (error) {
    setupCredentialsDBSpinner.fail("DB credentials setup failed!\n");
    process.exit(0);
  }
  setupCredentialsDBSpinner.stop();
}

async function copyEnvFiles() {
  const jobsEnv = filesystem.path("packages", "jobs", ".env.example");
  const webEnv = filesystem.path("packages", "web", ".env.example");
  const dbEnv = filesystem.path("packages", "shared", ".env.example");
  const jobsLocal = await filesystem.existsAsync(
    filesystem.path("packages", "jobs", ".env"),
  );
  const webLocal = await filesystem.existsAsync(
    filesystem.path("packages", "web", ".env"),
  );
  const dbLocal = await filesystem.existsAsync(
    filesystem.path("packages", "shared", ".env"),
  );
  if (!jobsLocal) {
    filesystem.copy(jobsEnv, filesystem.path("packages", "jobs", ".env"));
  }
  if (!webLocal) {
    filesystem.copy(webEnv, filesystem.path("packages", "web", ".env"));
  }
  if (!dbLocal) {
    filesystem.copy(dbEnv, filesystem.path("packages", "shared", ".env"));
  }
}

async function setupUserEmail() {
  const { email } = await prompt.ask([
    {
      type: "input",
      name: "email",
      message: "Enter your email",
    },
  ]);
  const dbPath = filesystem.path("packages", "shared", ".env");
  const dbEnv = await filesystem.readAsync(dbPath);
  const newDbEnv = dbEnv.replace(
    /SEED_USER_EMAIL=.*/,
    `SEED_USER_EMAIL="${email}"`,
  );
  filesystem.write(filesystem.path("packages", "shared", ".env"), newDbEnv);
}
