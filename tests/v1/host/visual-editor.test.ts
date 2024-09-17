import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser } from "playwright";
import { REPO_ROOT } from "../../lib/fs.js";
import { runNodeProcess } from "../../lib/process.js";

function mime(file: string): string {
  if (file.endsWith(".js")) {
    return "text/javascript";
  }
  if (file.endsWith(".css")) {
    return "text/css";
  }
  if (file.endsWith(".html")) {
    return "text/html";
  }
  if (file.endsWith(".json") || file.endsWith(".map")) {
    return "application/json";
  }
  if (file.endsWith(".woff2")) {
    return "font/woff2";
  }
  return "application/octet-stream";
}

function startStaticServer(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const relative = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(root, relative.replace(/^\//, ""));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": mime(filePath) });
    response.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

const dist = path.join(REPO_ROOT, "examples/playground/dist");

describe("playground visual editor production bundle", () => {
  beforeAll(() => {
    const build = runNodeProcess("pnpm", ["--filter", "@xunserver-jsf/example-playground", "build"]);
    expect(build.status, build.stderr).toBe(0);
  }, 180_000);

  test("VSE-IFRAME-STYLE-ISOLATION production bundle keeps editor chrome out of preview entries", () => {
    const assets = fs.readdirSync(path.join(dist, "assets"));
    const previewAssets = assets.filter((name) =>
      /element-plus|antd|arco-vue|arco-react|shadcn/.test(name),
    );
    expect(previewAssets.length).toBeGreaterThan(0);
    for (const file of previewAssets) {
      const content = fs.readFileSync(path.join(dist, "assets", file), "utf8");
      expect(content, file).not.toContain("@dnd-kit/react");
      expect(content, file).not.toContain("visual-schema-editor");
      expect(content, file).not.toContain("tw-animate-css");
    }
    const mainAssets = assets.filter((name) => name.startsWith("main-") && name.endsWith(".js"));
    expect(mainAssets.some((file) => fs.readFileSync(path.join(dist, "assets", file), "utf8").includes("visual-schema-editor"))).toBe(true);
  });
});

describe("playground visual editor host", () => {
  let server: { url: string; close: () => Promise<void> } | undefined;
  let browser: Browser | undefined;

  beforeAll(async () => {
    try {
      server = await startStaticServer(dist);
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = undefined;
    }
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  test("VSE-PREVIEW-BROADCAST visual edits stay on parent page and refresh previews", async ({ skip }) => {
    if (browser === undefined || server === undefined) {
      skip();
      return;
    }
    const page = await browser.newPage();
    await page.goto(`${server.url}/?example=simple`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "可视化" }).click();
    await expect(page.getByTestId("visual-schema-editor")).toBeVisible();
    await page.getByRole("button", { name: "添加数字" }).click();
    await page.getByRole("button", { name: "键盘移动" }).click();
    await page.getByRole("tab", { name: "文本" }).click();
    await expect(page.getByRole("tab", { name: "schema" })).toBeVisible();
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) {
        continue;
      }
      const frameHtml = await frame.content();
      expect(frameHtml).not.toContain("visual-drag-overlay");
      expect(frameHtml).not.toContain("tw-animate-css");
      expect(frameHtml).not.toContain("@dnd-kit/react");
    }
    await page.close();
  }, 120_000);
});
