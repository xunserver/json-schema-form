import path from "node:path";
import { parseArgs } from "node:util";
import { checkArchitecture, formatArchitectureDiagnostic } from "./check.ts";

const { values } = parseArgs({
  options: {
    root: {
      type: "string",
    },
  },
});

const workspaceRoot = path.resolve(values.root ?? process.cwd());
const diagnostics = checkArchitecture(workspaceRoot);

if (diagnostics.length === 0) {
  process.stdout.write(`Architecture boundaries passed for ${workspaceRoot}\n`);
  process.exit(0);
}

for (const diagnostic of diagnostics) {
  process.stderr.write(`${formatArchitectureDiagnostic(diagnostic)}\n`);
}

process.stderr.write(`Architecture boundaries failed with ${diagnostics.length} diagnostic(s).\n`);
process.exit(1);
