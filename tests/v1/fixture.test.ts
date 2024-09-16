import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";

describe("v1 shared fixture", () => {
  test("V1-FIXTURE-PUBLIC-ONLY stays framework-neutral", () => {
    const dir = path.join(REPO_ROOT, "tests/fixtures/v1");
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      expect(source).not.toMatch(/from ["']vue["']/);
      expect(source).not.toMatch(/from ["']react["']/);
      expect(source).not.toMatch(/from ["']@xunserver-jsf\/vue["']/);
      expect(source).not.toMatch(/from ["']@xunserver-jsf\/react["']/);
      expect(source).not.toMatch(/packages\/core\/src\//);
    }
  });
});
