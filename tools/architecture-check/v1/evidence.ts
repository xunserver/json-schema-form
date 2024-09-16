import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const EVIDENCE_DIR = "artifacts/v1";
export const EVIDENCE_FILE = "evidence.json";
export const PASS_MARKER = "PASS";
export const FAILURE_FILE = "failure.txt";

export interface EvidenceCommandResult {
  readonly id: string;
  readonly status: "pass" | "fail" | "skipped";
  readonly exitCode: number;
}

export interface EvidenceDocument {
  readonly schemaVersion: number;
  readonly architectureDigest: string;
  readonly revision?: string;
  readonly tools: Readonly<Record<string, string>>;
  readonly commands: readonly EvidenceCommandResult[];
  readonly testIds: readonly string[];
  readonly passed: boolean;
}

export function collectEvidence(
  workspaceRoot: string,
  document: EvidenceDocument,
): { outputPath?: string; passed: boolean; message: string } {
  const destDir = path.join(workspaceRoot, EVIDENCE_DIR);
  const destFile = path.join(destDir, EVIDENCE_FILE);
  const passMarker = path.join(destDir, PASS_MARKER);
  const failureFile = path.join(destDir, FAILURE_FILE);
  fs.mkdirSync(destDir, { recursive: true });

  const tempFile = path.join(destDir, `.${EVIDENCE_FILE}.${process.pid}.tmp`);
  const payload = JSON.stringify(document, null, 2);
  fs.writeFileSync(tempFile, `${payload}\n`);

  if (!document.passed) {
    fs.rmSync(passMarker, { force: true });
    fs.rmSync(tempFile, { force: true });
    fs.writeFileSync(
      failureFile,
      document.commands
        .filter((command) => command.status === "fail")
        .map((command) => `${command.id} exit=${command.exitCode}`)
        .join("\n") + "\n",
    );
    return { passed: false, message: "v1 evidence collection failed; pass marker removed" };
  }

  fs.renameSync(tempFile, destFile);
  fs.writeFileSync(passMarker, "ok\n");
  fs.rmSync(failureFile, { force: true });
  return { outputPath: destFile, passed: true, message: `wrote ${path.relative(workspaceRoot, destFile)}` };
}

export function toolVersions(workspaceRoot: string): Record<string, string> {
  const manifest = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
    packageManager?: string;
  };
  return {
    node: process.version,
    pnpm: String(manifest.packageManager ?? "pnpm"),
    typescript: String(manifest.devDependencies?.typescript ?? ""),
    vitest: String(manifest.devDependencies?.vitest ?? ""),
  };
}

export function gitRevision(workspaceRoot: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot, encoding: "utf8" });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim() || undefined;
}
