import fs from "node:fs";
import path from "node:path";
import { BUILTIN_COMMANDS, type CommandRecord, type MatrixIssue, type TestRecord } from "./types.ts";

export function resolveTests(
  workspaceRoot: string,
  tests: readonly TestRecord[],
  commands: readonly CommandRecord[],
): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  const commandIds = new Map(commands.map((command) => [command.id, command]));
  const seenIds = new Map<string, string>();

  for (const test of tests) {
    const previous = seenIds.get(test.id);
    if (previous !== undefined) {
      issues.push({
        code: "duplicate-test-id",
        message: `Test id ${test.id} is registered more than once`,
        entryId: test.id,
      });
    } else {
      seenIds.set(test.id, test.file);
    }

    const filePath = path.join(workspaceRoot, test.file);
    if (!fs.existsSync(filePath)) {
      issues.push({
        code: "missing-test-file",
        message: `Test file ${test.file} does not exist`,
        entryId: test.id,
        path: test.file,
      });
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const occurrences = countLiteral(content, test.id);
    if (occurrences === 0) {
      issues.push({
        code: "missing-test-id",
        message: `Test id ${test.id} does not appear in ${test.file}`,
        entryId: test.id,
        path: test.file,
      });
    } else if (occurrences > 1) {
      issues.push({
        code: "duplicate-test-literal",
        message: `Test id ${test.id} appears ${occurrences} times in ${test.file}`,
        entryId: test.id,
        path: test.file,
      });
    }
    if (!content.includes(test.title)) {
      issues.push({
        code: "missing-test-title",
        message: `Test title ${JSON.stringify(test.title)} does not appear in ${test.file}`,
        entryId: test.id,
        path: test.file,
      });
    }
    if (!commandIds.has(test.commandId)) {
      issues.push({
        code: "unknown-command",
        message: `Test ${test.id} references unknown command ${test.commandId}`,
        entryId: test.id,
      });
    }
  }

  return issues;
}

export function resolveCommands(
  workspaceRoot: string,
  commands: readonly CommandRecord[],
): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  const manifestPath = path.join(workspaceRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = manifest.scripts ?? {};

  for (const command of commands) {
    if (command.kind === "root-script") {
      if (!(command.name in scripts)) {
        issues.push({
          code: "unknown-root-script",
          message: `Command ${command.id} maps to missing root script ${command.name}`,
          entryId: command.id,
        });
      }
      continue;
    }
    if (command.kind === "builtin") {
      if (!(BUILTIN_COMMANDS as readonly string[]).includes(command.name)) {
        issues.push({
          code: "unknown-builtin",
          message: `Command ${command.id} is not a builtin checker (${command.name})`,
          entryId: command.id,
        });
      }
      continue;
    }
    issues.push({
      code: "arbitrary-command",
      message: `Command ${command.id} is not a root script or builtin checker`,
      entryId: command.id,
    });
  }

  return issues;
}

function countLiteral(content: string, id: string): number {
  let count = 0;
  let from = 0;
  while (from < content.length) {
    const index = content.indexOf(id, from);
    if (index < 0) {
      break;
    }
    count += 1;
    from = index + id.length;
  }
  return count;
}
