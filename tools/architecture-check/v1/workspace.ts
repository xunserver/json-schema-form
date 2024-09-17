import fs from "node:fs";
import path from "node:path";
import { checkArchitecture } from "../check.ts";
import { FIRST_PARTY_PACKAGES, RULE } from "../policy.ts";
import type { MatrixIssue } from "./types.ts";

const EXAMPLE_DIRS = [
  { id: "DIR-EX-PLAYGROUND", dir: "examples/playground" },
  { id: "DIR-EX-SHARED", dir: "examples/shared" },
] as const;

const TOP_DIRS = [
  { id: "DIR-TESTS", dir: "tests" },
  { id: "DIR-DOCS", dir: "docs" },
] as const;

const PACKAGE_LAYOUT: Readonly<Record<string, { id: string; dirs: readonly string[]; files: readonly string[] }>> = {
  "@xunserver-jsf/validator-ajv": {
    id: "DIR-VALIDATOR",
    dirs: [],
    files: ["ajv-validator-adapter.ts", "ajv-error-normalizer.ts", "create-ajv-validator.ts", "index.ts"],
  },
  "@xunserver-jsf/vue": {
    id: "DIR-VUE",
    dirs: ["renderer", "context", "composables", "adapter"],
    files: ["index.ts"],
  },
  "@xunserver-jsf/react": {
    id: "DIR-REACT",
    dirs: ["renderer", "context", "hooks", "adapter"],
    files: ["index.ts"],
  },
  "@xunserver-jsf/element-plus": {
    id: "DIR-ELEMENT-PLUS",
    dirs: ["widgets", "layouts", "field-chrome", "form"],
    files: ["create-element-plus-adapter.ts", "index.ts"],
  },
  "@xunserver-jsf/antd": {
    id: "DIR-ANTD",
    dirs: ["widgets", "layouts", "field-chrome", "form"],
    files: ["create-antd-adapter.ts", "index.ts"],
  },
  "@xunserver-jsf/shadcn": {
    id: "DIR-SHADCN",
    dirs: ["widgets", "layouts", "field-chrome", "form"],
    files: ["create-shadcn-adapter.ts", "index.ts"],
  },
};

const PACKAGE_DIRS: Readonly<Record<string, string>> = {
  "@xunserver-jsf/core": "core",
  "@xunserver-jsf/validator-ajv": "validator-ajv",
  "@xunserver-jsf/vue": "vue",
  "@xunserver-jsf/react": "react",
  "@xunserver-jsf/element-plus": "adapter/element-plus",
  "@xunserver-jsf/antd": "adapter/antd",
  "@xunserver-jsf/shadcn": "adapter/shadcn",
};

export { PACKAGE_DIRS as FIRST_PARTY_PACKAGE_DIRS };

const FORBIDDEN_BUNDLE = [
  "vue",
  "react",
  "react-dom",
  "element-plus",
  "antd",
  "ajv",
] as const;

export function checkV1Workspace(workspaceRoot: string): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  issues.push(...checkWorkspaceLayout(workspaceRoot));
  issues.push(...checkCoreLayoutEvidence(workspaceRoot));
  issues.push(...checkExportSurfaces(workspaceRoot));
  issues.push(...checkBundleGraph(workspaceRoot));
  return issues;
}

export function checkWorkspaceLayout(workspaceRoot: string): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  for (const entry of [...EXAMPLE_DIRS, ...TOP_DIRS]) {
    const full = path.join(workspaceRoot, entry.dir);
    if (!fs.existsSync(full)) {
      issues.push({
        code: "missing-directory",
        message: `[${entry.id}] Missing required path ${entry.dir}`,
        entryId: entry.id,
        path: entry.dir,
      });
    }
  }

  for (const packageName of FIRST_PARTY_PACKAGES) {
    const directory = PACKAGE_DIRS[packageName];
    if (directory === undefined) {
      continue;
    }
    const src = path.join(workspaceRoot, "packages", directory, "src");
    if (!fs.existsSync(src)) {
      issues.push({
        code: "missing-directory",
        message: `[PKG-${packageName}] Missing packages/${directory}/src`,
        entryId: `PKG-${directory.toUpperCase()}`,
        path: `packages/${directory}/src`,
      });
    }
    const layout = PACKAGE_LAYOUT[packageName];
    if (layout === undefined) {
      continue;
    }
    for (const dir of layout.dirs) {
      const full = path.join(src, dir);
      if (!fs.existsSync(full)) {
        issues.push({
          code: "missing-directory",
          message: `[${layout.id}] Missing ${path.relative(workspaceRoot, full)}`,
          entryId: layout.id,
          path: path.relative(workspaceRoot, full),
        });
      }
    }
    for (const file of layout.files) {
      const full = path.join(src, file);
      if (!fs.existsSync(full)) {
        issues.push({
          code: "missing-file",
          message: `[${layout.id}] Missing ${path.relative(workspaceRoot, full)}`,
          entryId: layout.id,
          path: path.relative(workspaceRoot, full),
        });
      }
    }
  }
  return issues;
}

export function checkCoreLayoutEvidence(workspaceRoot: string): MatrixIssue[] {
  const diagnostics = checkArchitecture(workspaceRoot).filter((diagnostic) => diagnostic.rule === RULE.coreLayout);
  return diagnostics.map((diagnostic) => ({
    code: "core-layout",
    message: `[DIR-CORE-LAYOUT] ${diagnostic.message}`,
    entryId: "DIR-CORE-LAYOUT",
    path: diagnostic.file,
  }));
}

export function checkExportSurfaces(workspaceRoot: string): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  for (const packageName of FIRST_PARTY_PACKAGES) {
    const directory = PACKAGE_DIRS[packageName];
    if (directory === undefined) {
      continue;
    }
    const manifestPath = path.join(workspaceRoot, "packages", directory, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      exports?: Record<string, { types?: string; import?: string } | string>;
    };
    const exportsMap = manifest.exports ?? {};
    for (const [key, value] of Object.entries(exportsMap)) {
      const catalogId = exportCatalogId(packageName, key);
      if (typeof value === "string") {
        continue;
      }
      for (const field of ["types", "import"] as const) {
        const relative = value[field];
        if (typeof relative !== "string") {
          issues.push({
            code: "export-mismatch",
            message: `[${catalogId}] ${packageName} export ${key} is missing ${field}`,
            entryId: catalogId,
            path: `packages/${directory}/package.json`,
          });
          continue;
        }
        const full = path.join(workspaceRoot, "packages", directory, relative);
        if (!fs.existsSync(full)) {
          issues.push({
            code: "export-mismatch",
            message: `[${catalogId}] ${packageName} export ${key} ${field} path ${relative} does not exist`,
            entryId: catalogId,
            path: path.relative(workspaceRoot, full),
          });
        }
      }
      if (value.types && value.import) {
        const declaration = readIfExists(path.join(workspaceRoot, "packages", directory, value.types));
        const runtime = readIfExists(path.join(workspaceRoot, "packages", directory, value.import));
        if (declaration !== undefined && runtime !== undefined) {
          const declared = collectExportedNames(declaration);
          const runtimeNames = collectRuntimeExportNames(runtime);
          for (const name of runtimeNames) {
            if (!declared.has(name) && !name.startsWith("_")) {
              issues.push({
                code: "export-mismatch",
                message: `[${catalogId}] runtime export ${name} is missing from declarations`,
                entryId: catalogId,
                path: value.types,
              });
            }
          }
        }
      }
    }
    if (packageName === "@xunserver-jsf/core") {
      for (const required of [".", "./runtime", "./extension"]) {
        if (!(required in exportsMap)) {
          issues.push({
            code: "export-mismatch",
            message: `[EXP-CORE] Missing Core export ${required}`,
            entryId: "EXP-CORE-ROOT",
            path: "packages/core/package.json",
          });
        }
      }
    } else if (!("." in exportsMap)) {
      issues.push({
        code: "export-mismatch",
        message: `[EXP-${directory.toUpperCase()}] Missing root export`,
        entryId: `EXP-${directory.toUpperCase()}`,
        path: `packages/${directory}/package.json`,
      });
    }
  }
  return issues;
}

export function checkBundleGraph(workspaceRoot: string): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  const coreDist = path.join(workspaceRoot, "packages/core/dist");
  if (!fs.existsSync(coreDist)) {
    return issues;
  }
  for (const file of collectJsFiles(coreDist)) {
    const content = fs.readFileSync(file, "utf8");
    for (const specifier of FORBIDDEN_BUNDLE) {
      if (content.includes(`from "${specifier}"`) || content.includes(`from '${specifier}'`) || content.includes(`"${specifier}"`)) {
        const isBareString = new RegExp(`from ["']${escapeRegExp(specifier)}["']`).test(content);
        if (isBareString) {
          issues.push({
            code: "forbidden-bundle",
            message: `[INV-09] Core bundle imports ${specifier}`,
            entryId: "INV-09",
            path: path.relative(workspaceRoot, file),
          });
        }
      }
    }
  }
  return issues;
}

function exportCatalogId(packageName: string, exportKey: string): string {
  if (packageName === "@xunserver-jsf/core" && exportKey === ".") {
    return "EXP-CORE-ROOT";
  }
  if (packageName === "@xunserver-jsf/core" && exportKey === "./runtime") {
    return "EXP-CORE-RUNTIME";
  }
  if (packageName === "@xunserver-jsf/core" && exportKey === "./extension") {
    return "EXP-CORE-EXTENSION";
  }
  return `EXP-${packageName.replace("@xunserver-jsf/", "").toUpperCase()}`;
}

function collectJsFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function collectExportedNames(declaration: string): Set<string> {
  const names = new Set<string>();
  for (const match of declaration.matchAll(/export\s+(?:declare\s+)?(?:type|interface|class|function|const|enum)\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]!);
  }
  for (const match of declaration.matchAll(/export\s+\{([^}]+)\}/g)) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}

function collectRuntimeExportNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+\{([^}]+)\}/g)) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name && !name.includes("/")) {
        names.add(name);
      }
    }
  }
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]!);
  }
  for (const match of source.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]!);
  }
  return names;
}

function readIfExists(filePath: string): string | undefined {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
