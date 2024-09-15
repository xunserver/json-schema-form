import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { REPO_ROOT } from "./fs.js";

export function runNodeProcess(
  command: string,
  args: string[],
  cwd = REPO_ROOT,
): SpawnSyncReturns<string> {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

export function runBoundaryCheck(workspaceRoot: string): SpawnSyncReturns<string> {
  return runNodeProcess("pnpm", [
    "exec",
    "tsx",
    "tools/architecture-check/cli.ts",
    "--root",
    workspaceRoot,
  ]);
}

export function runTsc(tsconfigPath: string): SpawnSyncReturns<string> {
  return runNodeProcess("pnpm", ["exec", "tsc", "--pretty", "false", "-p", tsconfigPath]);
}
