import callbackGlob from "glob";
import { filesystem } from "gluegun";
import { promisify } from "util";

module.exports = {
  name: "copy:feature",
  alias: "copyf",
  run: async () => {
    const glob = promisify(callbackGlob);
    const featureFiles = await glob(
      "packages/web/app/(admin)/features/tags/**/**/*.*",
    );
    const routeFiles = await glob(
      "packages/web/app/(admin)/(routes)/admin/tags/**/**/*.*",
    );
    const apiFiles = await glob(
      "packages/web/app/(admin)/(routes)/admin/api/tags/**/**/*.*",
    );

    // console.log({ featureFiles, routeFiles, apiFiles })

    // return
    [...featureFiles, ...routeFiles, ...apiFiles].forEach(async (filePath) => {
      const content = await filesystem.readAsync(filePath);

      await filesystem.writeAsync(
        replaceEntityName(filePath),
        replaceEntityName(content),
      );
    });
  },
};

function replaceEntityName(str: string) {
  return str
    .replace(/tags/g, "partnerCategories")
    .replace(/Tags/g, "PartnerCategories")
    .replace(/tag/g, "partnerCategory")
    .replace(/Tag/g, "PartnerCategory");
}
