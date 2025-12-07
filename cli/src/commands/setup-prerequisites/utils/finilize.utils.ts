import { print } from "gluegun";

export async function finilize() {
  print.success("Setting up preqrequesties success");
  print.newline();
  print.highlight("Run the following command to start the application:\n");
  print.highlight("npm run dev\n");
  process.exit(0);
}
