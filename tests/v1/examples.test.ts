import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createDemoForm } from "../../examples/shared/src/demo.ts";
import { REPO_ROOT } from "../lib/fs.js";
import { runNodeProcess } from "../lib/process.js";

describe("v1 examples", () => {
  test("V1-EXAMPLES typechecks the public playground and shared catalog", async () => {
    const playgroundPkg = fs.readFileSync(path.join(REPO_ROOT, "examples/playground/package.json"), "utf8");
    const playgroundSrc = collectSource(path.join(REPO_ROOT, "examples/playground/src"));
    const sharedEnv = fs.readFileSync(path.join(REPO_ROOT, "examples/shared/src/environment.ts"), "utf8");
    const kitchenSink = fs.readFileSync(
      path.join(REPO_ROOT, "examples/shared/catalog/kitchen-sink.json"),
      "utf8",
    );
    expect(playgroundPkg).toContain("@xunserver-jsf/example-shared");
    expect(playgroundPkg).not.toContain("@mui/");
    expect(playgroundSrc).toContain("@xunserver-jsf/example-shared");
    expect(fs.readFileSync(path.join(REPO_ROOT, "examples/shared/src/index.ts"), "utf8")).toContain(
      "VisualGroupNode",
    );
    expect(playgroundSrc).not.toMatch(/@xunserver-jsf\/vue\/src/);
    expect(playgroundSrc).not.toMatch(/@xunserver-jsf\/react\/src/);
    expect(sharedEnv).toContain("company.currency");
    expect(kitchenSink).toContain("company.currency");

    const shared = runNodeProcess("pnpm", ["--filter", "@xunserver-jsf/example-shared", "typecheck"]);
    expect(shared.status, shared.stderr).toBe(0);
    const playground = runNodeProcess("pnpm", ["--filter", "@xunserver-jsf/example-playground", "typecheck"]);
    expect(playground.status, playground.stderr).toBe(0);

    const form = createDemoForm();
    expect(form.getValue("name")).toBe("Ada");
    const submitted = await form.submit(async (payload) => payload);
    expect(submitted.submitted).toBe(true);
    expect(submitted.valid).toBe(true);
  });
});

function collectSource(root: string): string {
  const parts: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      parts.push(collectSource(full));
      continue;
    }
    if (/\.(?:ts|tsx)$/.test(entry.name)) {
      parts.push(fs.readFileSync(full, "utf8"));
    }
  }
  return parts.join("\n");
}
