import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  ALLOWED_EDGES,
  FIRST_PARTY_PACKAGES,
  REQUIRED_PEERS,
  RULE,
  frameworkFamily,
  isAllowedEdge,
  isCoreForbiddenPackage,
  isFirstPartyPackage,
  isHostPackage,
  isReverseEdge,
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
  }

  return diagnostics;
}

export function formatArchitectureDiagnostic(diagnostic: ArchitectureDiagnostic): string {
  const location = diagnostic.file ? ` ${diagnostic.file}` : "";
  const specifier = diagnostic.specifier ? ` imported "${diagnostic.specifier}"` : "";
  return `${diagnostic.sourcePackage} -> ${diagnostic.targetPackage} [${diagnostic.rule}]${location}${specifier} ${diagnostic.message}`;
}

function discoverPackages(workspaceRoot: string): DiscoveredPackage[] {
  const packagesRoot = path.join(workspaceRoot, "packages");
  if (!fs.existsSync(packagesRoot)) {
    return [];
  }

  return fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(packagesRoot, entry.name);
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
        message: "Unexpected package under packages/*; first-period workspace allows only the six @form packages.",
      });
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
    if (pkg.name === "@form/core" && isCoreForbiddenPackage(target)) {
      diagnostics.push({
        sourcePackage: pkg.name,
        targetPackage: target,
        rule: RULE.forbiddenCorePackage,
        message: `Core must not depend on "${target}".`,
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

      if (pkg.name === "@form/core" && isCoreForbiddenPackage(targetName)) {
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
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "type-tests") {
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
