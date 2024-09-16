import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeBase(value: string): string {
  const trimmed = value.trim();
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const docsBase = normalizeBase(process.env.DOCS_BASE ?? "/json-schema-form/");
const playgroundBase = `${docsBase}playground/`;

run("pnpm", ["docs:build"], { DOCS_BASE: docsBase });
run("pnpm", ["--filter", "@xunserver-jsf/example-playground", "build"], {
  PLAYGROUND_BASE: playgroundBase,
});

const docsDist = path.join(root, "docs/.vitepress/dist");
const playgroundDist = path.join(root, "examples/playground/dist");
const playgroundDest = path.join(docsDist, "playground");

if (!fs.existsSync(docsDist)) {
  throw new Error(`Missing VitePress output at ${docsDist}`);
}
if (!fs.existsSync(playgroundDist)) {
  throw new Error(`Missing playground output at ${playgroundDist}`);
}

fs.rmSync(playgroundDest, { recursive: true, force: true });
fs.cpSync(playgroundDist, playgroundDest, { recursive: true });
fs.writeFileSync(path.join(docsDist, ".nojekyll"), "");

const required = ["index.html", "playground/index.html", "playground/element-plus.html"];
for (const relative of required) {
  const full = path.join(docsDist, relative);
  if (!fs.existsSync(full)) {
    throw new Error(`site:build missing ${relative}`);
  }
}

process.stdout.write(`Wrote GitHub Pages site to ${docsDist}\n`);
