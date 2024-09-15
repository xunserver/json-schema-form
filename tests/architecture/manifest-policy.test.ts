import path from "node:path";
import { describe, expect, test } from "vitest";
import { checkArchitecture } from "../../tools/architecture-check/check.ts";
import { REQUIRED_PEERS } from "../../tools/architecture-check/policy.ts";
import { REPO_ROOT, readJson } from "../lib/fs.ts";

describe("manifest policy", () => {
  test("places host frameworks only as peerDependencies on integration packages", () => {
    const diagnostics = checkArchitecture(REPO_ROOT);
    expect(diagnostics).toEqual([]);

    for (const [packageName, peers] of Object.entries(REQUIRED_PEERS)) {
      const directory = packageName.replace("@form/", "");
      const manifest = readJson<{
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      }>(path.join(REPO_ROOT, "packages", directory, "package.json"));

      for (const peer of peers ?? []) {
        expect(manifest.peerDependencies?.[peer], `${packageName} peer ${peer}`).toBeTypeOf("string");
        expect(manifest.dependencies?.[peer]).toBeUndefined();
      }
    }
  });
});
