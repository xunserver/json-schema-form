export const FIRST_PARTY_PACKAGES = [
  "@form/core",
  "@form/validator-ajv",
  "@form/vue",
  "@form/react",
  "@form/element-plus",
  "@form/mui",
] as const;

export type FirstPartyPackage = (typeof FIRST_PARTY_PACKAGES)[number];

export const ALLOWED_EDGES: Readonly<Record<FirstPartyPackage, readonly FirstPartyPackage[]>> = {
  "@form/core": [],
  "@form/validator-ajv": ["@form/core"],
  "@form/vue": ["@form/core"],
  "@form/react": ["@form/core"],
  "@form/element-plus": ["@form/core", "@form/vue"],
  "@form/mui": ["@form/core", "@form/react"],
};

export const REQUIRED_PEERS: Readonly<Partial<Record<FirstPartyPackage, readonly string[]>>> = {
  "@form/vue": ["vue"],
  "@form/react": ["react"],
  "@form/element-plus": ["vue", "element-plus"],
  "@form/mui": ["react", "@mui/material"],
};

export const HOST_PACKAGES = [
  "vue",
  "react",
  "react-dom",
  "element-plus",
  "@mui/material",
  "@mui/system",
] as const;

export const CORE_FORBIDDEN_PACKAGES = [
  ...HOST_PACKAGES,
  "ajv",
  "ajv-formats",
] as const;

export const RULE = {
  reverseDependency: "reverse-dependency",
  crossFrameworkDependency: "cross-framework-dependency",
  undeclaredDependency: "undeclared-dependency",
  relativeCrossPackageImport: "relative-cross-package-import",
  forbiddenEdge: "forbidden-edge",
  forbiddenCorePackage: "forbidden-core-package",
  hostPeerPlacement: "host-peer-placement",
  missingPeer: "missing-peer",
  coreLayout: "core-layout",
} as const;

export type RuleId = (typeof RULE)[keyof typeof RULE];

export const CORE_TOP_LEVEL_DIRS = [
  "definition",
  "schema",
  "compiler",
  "model",
  "runtime",
  "widget",
  "rule",
  "validation",
  "extension",
  "diagnostic",
  "engine",
] as const;

export const CORE_COMPILER_SUBDIRS = ["schema", "shape", "data", "ui", "rule", "validation"] as const;
export const CORE_MODEL_SUBDIRS = ["data", "ui", "rule", "validation", "schema-dynamics"] as const;
export const CORE_RUNTIME_SUBDIRS = [
  "form",
  "value",
  "state",
  "transaction",
  "array",
  "dependency",
  "subscription",
  "scope",
] as const;

export const CORE_FORBIDDEN_TOP_LEVEL_DIRS = ["types", "services", "utils"] as const;

export function isFirstPartyPackage(name: string): name is FirstPartyPackage {
  return (FIRST_PARTY_PACKAGES as readonly string[]).includes(name);
}

export function isAllowedEdge(source: FirstPartyPackage, target: FirstPartyPackage): boolean {
  return ALLOWED_EDGES[source].includes(target);
}

export function isReverseEdge(source: FirstPartyPackage, target: FirstPartyPackage): boolean {
  return ALLOWED_EDGES[target].includes(source);
}

export function frameworkFamily(packageName: string): "vue" | "react" | undefined {
  if (packageName === "@form/vue" || packageName === "@form/element-plus") {
    return "vue";
  }

  if (packageName === "@form/react" || packageName === "@form/mui") {
    return "react";
  }

  return undefined;
}

export function isHostPackage(name: string): boolean {
  return (HOST_PACKAGES as readonly string[]).includes(name);
}

export function isCoreForbiddenPackage(name: string): boolean {
  return (CORE_FORBIDDEN_PACKAGES as readonly string[]).includes(name);
}

export function packageNameFromSpecifier(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    if (!scope || !name) {
      return specifier;
    }
    return `${scope}/${name}`;
  }

  const [name] = specifier.split("/");
  return name;
}
