import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  ALLOWED_EDGES,
  FIRST_PARTY_PACKAGES,
  REQUIRED_PEERS,
  RULE,
  CORE_COMPILER_SUBDIRS,
  CORE_FORBIDDEN_TOP_LEVEL_DIRS,
  CORE_MODEL_SUBDIRS,
  CORE_RUNTIME_SUBDIRS,
  CORE_TOP_LEVEL_DIRS,
  frameworkFamily,
  isAllowedEdge,
  isCoreForbiddenPackage,
  isFirstPartyPackage,
  isHostPackage,
  isMuiForbiddenPackage,
  isReverseEdge,
  isExampleChromePackage,
  packageNameFromSpecifier,
  type FirstPartyPackage,
} from "./policy.ts";
import type { ArchitectureDiagnostic, DiscoveredPackage, PackageManifest } from "./types.ts";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

export function checkArchitecture(workspaceRoot: string): ArchitectureDiagnostic[] {
  const packages = discoverPackages(workspaceRoot);
  const diagnostics: ArchitectureDiagnostic[] = [];
  const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));

  diagnostics.push(...checkExpectedPackageSet(packages));

  for (const pkg of packages) {
    if (!isFirstPartyPackage(pkg.name)) {
      continue;
    }

    diagnostics.push(...checkManifestPolicy(pkg));
    diagnostics.push(...checkSourceImports(pkg, packages, packagesByName));
    if (pkg.name === "@xunserver-jsf/core") {
      diagnostics.push(...checkCoreLayout(pkg));
    }
  }

  diagnostics.push(...checkExampleChromeBoundaries(workspaceRoot, packages));

  return diagnostics;
}

export function formatArchitectureDiagnostic(diagnostic: ArchitectureDiagnostic): string {
  const location = diagnostic.file ? ` ${diagnostic.file}` : "";
  const specifier = diagnostic.specifier ? ` imported "${diagnostic.specifier}"` : "";
  return `${diagnostic.sourcePackage} -> ${diagnostic.targetPackage} [${diagnostic.rule}]${location}${specifier} ${diagnostic.message}`;
}

function checkCoreLayout(pkg: DiscoveredPackage): ArchitectureDiagnostic[] {
  const srcRoot = path.join(pkg.directory, "src");
  const diagnostics: ArchitectureDiagnostic[] = [];
  if (!fs.existsSync(srcRoot)) {
    diagnostics.push(
      layoutDiagnostic(pkg.name, srcRoot, `Core source root is missing: ${path.relative(pkg.directory, srcRoot)}`),
    );
    return diagnostics;
  }

  const entries = fs.readdirSync(srcRoot, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const required = new Set<string>(CORE_TOP_LEVEL_DIRS);
  const forbidden = new Set<string>(CORE_FORBIDDEN_TOP_LEVEL_DIRS);

  if (!files.includes("index.ts")) {
    diagnostics.push(layoutDiagnostic(pkg.name, path.join(srcRoot, "index.ts"), "Missing Core entry file index.ts"));
  }

  for (const extra of files.filter((name) => name !== "index.ts")) {
    diagnostics.push(
      layoutDiagnostic(pkg.name, path.join(srcRoot, extra), `Unexpected Core top-level file ${extra}`),
    );
  }

  for (const dir of dirs) {
    if (forbidden.has(dir) || !required.has(dir)) {
      diagnostics.push(
        layoutDiagnostic(pkg.name, path.join(srcRoot, dir), `Directory ${dir} is not in the Core architecture set`),
      );
    }
  }

  for (const dir of CORE_TOP_LEVEL_DIRS) {
    if (!dirs.includes(dir)) {
      diagnostics.push(layoutDiagnostic(pkg.name, path.join(srcRoot, dir), `Missing Core domain directory ${dir}`));
    }
  }

  diagnostics.push(
    ...checkRequiredSubdirs(pkg.name, path.join(srcRoot, "compiler"), CORE_COMPILER_SUBDIRS),
    ...checkRequiredSubdirs(pkg.name, path.join(srcRoot, "model"), CORE_MODEL_SUBDIRS),
    ...checkRequiredSubdirs(pkg.name, path.join(srcRoot, "runtime"), CORE_RUNTIME_SUBDIRS),
  );

  return diagnostics;
}

function checkRequiredSubdirs(
  sourcePackage: string,
  parent: string,
  required: readonly string[],
): ArchitectureDiagnostic[] {
  const diagnostics: ArchitectureDiagnostic[] = [];
  if (!fs.existsSync(parent)) {
    return diagnostics;
  }
  const dirs = fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const dir of required) {
    if (!dirs.includes(dir)) {
      diagnostics.push(layoutDiagnostic(sourcePackage, path.join(parent, dir), `Missing Core subdomain directory ${dir}`));
    }
  }
  return diagnostics;
}

function layoutDiagnostic(sourcePackage: string, file: string, message: string): ArchitectureDiagnostic {
  return {
    sourcePackage,
    targetPackage: sourcePackage,
    rule: RULE.coreLayout,
    message,
    file,
  };
}

function discoverPackages(workspaceRoot: string): DiscoveredPackage[] {
  const packagesRoot = path.join(workspaceRoot, "packages");
  if (!fs.existsSync(packagesRoot)) {
    return [];
  }

  const directories: string[] = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(packagesRoot, entry.name);
    if (entry.name === "adapter") {
      for (const nested of fs.readdirSync(directory, { withFileTypes: true })) {
        if (nested.isDirectory()) {
          directories.push(path.join(directory, nested.name));
        }
      }
      continue;
    }
    directories.push(directory);
  }

  return directories
    .map((directory) => {
      const manifestPath = path.join(directory, "package.json");
      if (!fs.existsSync(manifestPath)) {
        return undefined;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PackageManifest;
      if (!manifest.name) {
        return undefined;
      }

      return { name: manifest.name, directory, manifest };
    })
    .filter((pkg): pkg is DiscoveredPackage => pkg !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function checkExpectedPackageSet(packages: DiscoveredPackage[]): ArchitectureDiagnostic[] {
  const names = new Set(packages.map((pkg) => pkg.name));
  const diagnostics: ArchitectureDiagnostic[] = [];

  for (const expected of FIRST_PARTY_PACKAGES) {
    if (!names.has(expected)) {
      diagnostics.push({
        sourcePackage: expected,
        targetPackage: "(workspace)",
        rule: RULE.forbiddenEdge,
        message: "Expected first-party package is missing from packages/*.",
      });
    }
  }

  for (const pkg of packages) {
    if (!isFirstPartyPackage(pkg.name)) {
      diagnostics.push({
        sourcePackage: pkg.name,
        targetPackage: "(workspace)",
        rule: RULE.forbiddenEdge,
        message: "Unexpected package under packages/*; first-period workspace allows only the nine @xunserver-jsf packages.",
      });
    }
  }

  return diagnostics;
}

function checkExampleChromeBoundaries(workspaceRoot: string, packages: DiscoveredPackage[]): ArchitectureDiagnostic[] {
  const diagnostics: ArchitectureDiagnostic[] = [];
  for (const pkg of packages) {
    if (!isFirstPartyPackage(pkg.name)) {
      continue;
    }
    const productDeps = {
      ...pkg.manifest.dependencies,
      ...pkg.manifest.devDependencies,
      ...pkg.manifest.peerDependencies,
      ...pkg.manifest.optionalDependencies,
    };
    for (const dep of Object.keys(productDeps)) {
      if (isExampleChromePackage(dep) && (dep.startsWith("@dnd-kit/") || dep.includes("monaco") || dep === "tailwindcss")) {
        diagnostics.push({
          sourcePackage: pkg.name,
          targetPackage: dep,
          rule: RULE.exampleChromeLeak,
          message: "Product packages must not depend on playground editor chrome (Monaco, Tailwind, or drag-and-drop).",
        });
      }
    }
  }

  const sharedDir = path.join(workspaceRoot, "examples", "shared");
  const sharedManifestPath = path.join(sharedDir, "package.json");
  if (fs.existsSync(sharedManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(sharedManifestPath, "utf8")) as PackageManifest;
    const deps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    };
    for (const dep of Object.keys(deps)) {
      if (isExampleChromePackage(dep)) {
        diagnostics.push({
          sourcePackage: "@xunserver-jsf/example-shared",
          targetPackage: dep,
          rule: RULE.exampleChromeLeak,
          message: "examples/shared must remain framework/DOM-neutral and must not depend on React, Monaco, or drag-and-drop.",
        });
      }
    }
    for (const file of collectSourceFiles(path.join(sharedDir, "src"))) {
      const content = fs.readFileSync(file, "utf8");
      for (const specifier of collectImportedSpecifiers(file, content)) {
        const name = packageNameFromSpecifier(specifier);
        if (name !== undefined && isExampleChromePackage(name)) {
          diagnostics.push({
            sourcePackage: "@xunserver-jsf/example-shared",
            targetPackage: name,
            rule: RULE.exampleChromeLeak,
            message: "examples/shared source must not import React, DOM editor chrome, Monaco, or drag-and-drop.",
            file,
            specifier,
          });
        }
      }
    }
  }

  return diagnostics;
}

function checkManifestPolicy(pkg: DiscoveredPackage): ArchitectureDiagnostic[] {
  const diagnostics: ArchitectureDiagnostic[] = [];
  const productDeps = {
    ...pkg.manifest.dependencies,
    ...pkg.manifest.optionalDependencies,
  };
  const allListed = {
    ...productDeps,
    ...pkg.manifest.devDependencies,
    ...pkg.manifest.peerDependencies,
  };

  for (const target of Object.keys(productDeps)) {
    if (isFirstPartyPackage(pkg.name) && isFirstPartyPackage(target)) {
      diagnostics.push(...classifyFirstPartyEdge(pkg.name, target, `manifest dependency "${target}"`));
    }

    if (isHostPackage(target)) {
      diagnostics.push({
        sourcePackage: pkg.name,
        targetPackage: target,
        rule: RULE.hostPeerPlacement,
        message: `Host package "${target}" must be declared as a peerDependency, not a bundled production dependency.`,
        file: path.join(pkg.directory, "package.json"),
      });
    }
  }

  for (const target of Object.keys(allListed)) {
    if (pkg.name === "@xunserver-jsf/core" && isCoreForbiddenPackage(target)) {
      diagnostics.push({
        sourcePackage: pkg.name,
        targetPackage: target,
        rule: RULE.forbiddenCorePackage,
        message: `Core must not depend on "${target}".`,
        file: path.join(pkg.directory, "package.json"),
      });
    }

    if (pkg.name !== "@xunserver-jsf/validator-ajv" && (target === "ajv" || target === "ajv-formats")) {
      diagnostics.push({
        sourcePackage: pkg.name,
        targetPackage: target,
        rule: RULE.forbiddenCorePackage,
        message: `Only @xunserver-jsf/validator-ajv may depend on "${target}".`,
        file: path.join(pkg.directory, "package.json"),
      });
    }

    if (
      (pkg.name === "@xunserver-jsf/react" ||
        pkg.name === "@xunserver-jsf/antd" ||
        pkg.name === "@xunserver-jsf/arco-react" ||
        pkg.name === "@xunserver-jsf/arco-vue" ||
        pkg.name === "@xunserver-jsf/shadcn") &&
      isMuiForbiddenPackage(target)
    ) {
      diagnostics.push({
        sourcePackage: pkg.name,
        targetPackage: target,
        rule: RULE.forbiddenMuiXPackage,
        message: `UI adapter packages must not depend on "${target}".`,
        file: path.join(pkg.directory, "package.json"),
      });
    }
  }

  const requiredPeers = REQUIRED_PEERS[pkg.name as FirstPartyPackage] ?? [];
  for (const peer of requiredPeers) {
    if (!pkg.manifest.peerDependencies?.[peer]) {
      diagnostics.push({
        sourcePackage: pkg.name,
        targetPackage: peer,
        rule: RULE.missingPeer,
        message: `Expected host peerDependency "${peer}" is missing.`,
        file: path.join(pkg.directory, "package.json"),
      });
    }
  }

  return diagnostics;
}

function checkSourceImports(
  pkg: DiscoveredPackage,
  packages: DiscoveredPackage[],
  packagesByName: Map<string, DiscoveredPackage>,
): ArchitectureDiagnostic[] {
  const diagnostics: ArchitectureDiagnostic[] = [];
  const compilerOptions = createCompilerOptions();
  const host = createResolutionHost();
  const declaredFirstParty = new Set(
    Object.keys({
      ...pkg.manifest.dependencies,
      ...pkg.manifest.optionalDependencies,
    }).filter(isFirstPartyPackage),
  );

  for (const file of collectSourceFiles(path.join(pkg.directory, "src"))) {
    const content = fs.readFileSync(file, "utf8");
    for (const specifier of collectImportedSpecifiers(file, content)) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = resolveSpecifier(specifier, file, compilerOptions, host);
        const targetPackage = resolved ? packageOwningFile(resolved, packages) : undefined;
        if (targetPackage && targetPackage.name !== pkg.name) {
          diagnostics.push({
            sourcePackage: pkg.name,
            targetPackage: targetPackage.name,
            rule: RULE.relativeCrossPackageImport,
            message: "Relative imports must not cross package boundaries; use the package name export instead.",
            file,
            specifier,
          });
        }
        continue;
      }

      const targetName = packageNameFromSpecifier(specifier);
      if (!targetName) {
        continue;
      }

      if (pkg.name === "@xunserver-jsf/core" && isCoreForbiddenPackage(targetName)) {
        diagnostics.push({
          sourcePackage: pkg.name,
          targetPackage: targetName,
          rule: RULE.forbiddenCorePackage,
          message: `Core must not import "${targetName}".`,
          file,
          specifier,
        });
        continue;
      }

      if (pkg.name !== "@xunserver-jsf/validator-ajv" && (targetName === "ajv" || targetName === "ajv-formats")) {
        diagnostics.push({
          sourcePackage: pkg.name,
          targetPackage: targetName,
          rule: RULE.forbiddenCorePackage,
          message: `Only @xunserver-jsf/validator-ajv may import "${targetName}".`,
          file,
          specifier,
        });
        continue;
      }

      if (
        (pkg.name === "@xunserver-jsf/react" ||
          pkg.name === "@xunserver-jsf/antd" ||
          pkg.name === "@xunserver-jsf/arco-react" ||
          pkg.name === "@xunserver-jsf/arco-vue" ||
          pkg.name === "@xunserver-jsf/shadcn") &&
        isMuiForbiddenPackage(targetName)
      ) {
        diagnostics.push({
          sourcePackage: pkg.name,
          targetPackage: targetName,
          rule: RULE.forbiddenMuiXPackage,
          message: `UI adapter packages must not import "${targetName}".`,
          file,
          specifier,
        });
        continue;
      }

      if (!isFirstPartyPackage(pkg.name) || !isFirstPartyPackage(targetName)) {
        continue;
      }

      if (!isAllowedEdge(pkg.name, targetName)) {
        diagnostics.push(
          ...classifyFirstPartyEdge(pkg.name, targetName, `source import "${specifier}"`, file, specifier),
        );
        continue;
      }

      if (!declaredFirstParty.has(targetName) && targetName !== pkg.name) {
        diagnostics.push({
          sourcePackage: pkg.name,
          targetPackage: targetName,
          rule: RULE.undeclaredDependency,
          message: `Import of "${targetName}" is allowed by the architecture graph but is not declared in package.json dependencies.`,
          file,
          specifier,
        });
      } else if (!packagesByName.has(targetName)) {
        diagnostics.push({
          sourcePackage: pkg.name,
          targetPackage: targetName,
          rule: RULE.undeclaredDependency,
          message: `Import of "${targetName}" does not resolve to a workspace package.`,
          file,
          specifier,
        });
      }
    }
  }

  return diagnostics;
}

function classifyFirstPartyEdge(
  source: FirstPartyPackage,
  target: FirstPartyPackage,
  detail: string,
  file?: string,
  specifier?: string,
): ArchitectureDiagnostic[] {
  if (isAllowedEdge(source, target) || source === target) {
    return [];
  }

  const sourceFamily = frameworkFamily(source);
  const targetFamily = frameworkFamily(target);
  if (sourceFamily && targetFamily && sourceFamily !== targetFamily) {
    return [
      {
        sourcePackage: source,
        targetPackage: target,
        rule: RULE.crossFrameworkDependency,
        message: `Cross-framework product dependency is not allowed (${detail}).`,
        file,
        specifier,
      },
    ];
  }

  if (isReverseEdge(source, target)) {
    return [
      {
        sourcePackage: source,
        targetPackage: target,
        rule: RULE.reverseDependency,
        message: `Reverse product dependency is not allowed (${detail}).`,
        file,
        specifier,
      },
    ];
  }

  return [
    {
      sourcePackage: source,
      targetPackage: target,
      rule: RULE.forbiddenEdge,
      message: `Product dependency is not in the canonical allowlist (${detail}). Allowed targets: ${ALLOWED_EDGES[source].join(", ") || "(none)"}.`,
      file,
      specifier,
    },
  ];
}

function collectSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "type-tests" || entry.name === "test-utils") {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.includes(path.extname(entry.name)) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx") &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectImportedSpecifiers(fileName: string, content: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function createCompilerOptions(): ts.CompilerOptions {
  return {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    allowJs: false,
  };
}

function createResolutionHost(): ts.ModuleResolutionHost {
  return {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    realpath: ts.sys.realpath,
    directoryExists: ts.sys.directoryExists,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getDirectories: ts.sys.getDirectories,
  };
}

function resolveSpecifier(
  specifier: string,
  containingFile: string,
  compilerOptions: ts.CompilerOptions,
  host: ts.ModuleResolutionHost,
): string | undefined {
  const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, host);
  if (resolved.resolvedModule?.resolvedFileName) {
    return path.resolve(resolved.resolvedModule.resolvedFileName);
  }

  const fallback = path.resolve(path.dirname(containingFile), specifier);
  const candidates = [
    fallback,
    `${fallback}.ts`,
    `${fallback}.tsx`,
    `${fallback}.js`,
    path.join(fallback, "index.ts"),
    path.join(fallback, "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function packageOwningFile(fileName: string, packages: DiscoveredPackage[]): DiscoveredPackage | undefined {
  const normalized = path.resolve(fileName);
  return packages.find((pkg) => {
    const root = path.resolve(pkg.directory) + path.sep;
    return normalized.startsWith(root) || normalized === path.resolve(pkg.directory);
  });
}
