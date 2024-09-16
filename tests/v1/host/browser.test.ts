import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser } from "playwright";
import { REPO_ROOT } from "../../lib/fs.js";

function mime(file: string): string {
  if (file.endsWith(".js")) {
    return "text/javascript";
  }
  if (file.endsWith(".html")) {
    return "text/html";
  }
  if (file.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html>
<html><body>
<div id="out"></div>
<script type="importmap">
{
  "imports": {
    "@form/core": "/packages/core/dist/index.js",
    "@form/core/runtime": "/packages/core/dist/runtime/index.js",
    "@form/core/extension": "/packages/core/dist/extension/index.js"
  }
}
</script>
<script type="module" src="/tests/v1/host/browser-smoke.js"></script>
</body></html>`);
      return;
    }
    const filePath = path.join(REPO_ROOT, url.pathname.replace(/^\//, ""));
    if (!filePath.startsWith(REPO_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

describe("v1 real browser host", () => {
  let server: { url: string; close: () => Promise<void> };
  let browser: Browser;

  beforeAll(async () => {
    server = await startServer();
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  test("V1-PORTABILITY-BROWSER loads public Core ESM in Chromium", async () => {
    const page = await browser.newPage();
    await page.goto(server.url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("out")?.textContent === "Grace");
    expect(await page.textContent("#out")).toBe("Grace");
    await page.close();
  });

  test("V1-PORTABILITY-WORKER runs Core inside a module Worker", async () => {
    const page = await browser.newPage();
    await page.goto(server.url, { waitUntil: "networkidle" });
    const result = await page.evaluate(async () => {
      const worker = new Worker("/tests/v1/host/worker-smoke.js", { type: "module" });
      const payload = await new Promise((resolve, reject) => {
        worker.addEventListener("message", (event) => resolve(event.data), { once: true });
        worker.addEventListener("error", (event) => reject(event.message), { once: true });
        worker.postMessage("run");
      });
      worker.terminate();
      return payload;
    });
    expect(result).toEqual({ name: "Worker", hasDocument: false });
    await page.close();
  });
});
