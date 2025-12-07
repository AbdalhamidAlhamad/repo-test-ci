import { GluegunCommand } from "gluegun";
import { generateCronJobTemplate } from "./entities/cronjob";

const ENTITY_TYPES = [
  { name: "Cron Job", value: "cronjob" },
  { name: "Component", value: "component" },
  { name: "API", value: "api" },
];

const command: GluegunCommand = {
  name: "generate",
  description: "Generate code templates (e.g., cron-job, web, CRUD)",
  run: async (toolbox) => {
    const { print, prompt, parameters, strings } = toolbox;
    print.info("Welcome to the Generate command!");

    // Prompt for entity type
    const { entityTypeName } = await prompt.ask({
      type: "select",
      name: "entityTypeName",
      message: "Which entity do you want to create?",
      choices: ENTITY_TYPES.map((type) => type.name),
    });

    const entityType = ENTITY_TYPES.find(
      (type) => type.name === entityTypeName,
    )?.value;

    if (entityType === "cronjob") {
      // Prompt for job name if not provided
      let jobName = parameters.first;
      if (!jobName) {
        const response = await prompt.ask({
          type: "input",
          name: "jobName",
          message: "Enter the cron-job name:",
          validate: (value) => (value ? true : "Cron Job name is required"),
        });
        jobName = response.jobName;
      }

      const normalizedJobName = strings.kebabCase(jobName);

      if (normalizedJobName !== jobName) {
        print.info(`Normalized job name to: ${normalizedJobName}`);
      }

      try {
        await generateCronJobTemplate(toolbox, normalizedJobName);
        print.success(`Job template generated for: ${normalizedJobName}`);
      } catch (error) {
        print.error(`Failed to generate job template: ${error}`);
      }
    } else {
      print.info(`Generator for '${entityType}' is not implemented yet.`);
    }
  },
};

export default command;
