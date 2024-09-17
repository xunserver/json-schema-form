export const FIRST_PARTY_PACKAGES = [
  "@xunserver-jsf/core",
  "@xunserver-jsf/validator-ajv",
  "@xunserver-jsf/vue",
  "@xunserver-jsf/react",
  "@xunserver-jsf/element-plus",
  "@xunserver-jsf/antd",
  "@xunserver-jsf/shadcn",
] as const;

export type FirstPartyPackage = (typeof FIRST_PARTY_PACKAGES)[number];

export const ALLOWED_EDGES: Readonly<Record<FirstPartyPackage, readonly FirstPartyPackage[]>> = {
  "@xunserver-jsf/core": [],
  "@xunserver-jsf/validator-ajv": ["@xunserver-jsf/core"],
  "@xunserver-jsf/vue": ["@xunserver-jsf/core"],
  "@xunserver-jsf/react": ["@xunserver-jsf/core"],
  "@xunserver-jsf/element-plus": ["@xunserver-jsf/core", "@xunserver-jsf/vue"],
  "@xunserver-jsf/antd": ["@xunserver-jsf/core", "@xunserver-jsf/react"],
  "@xunserver-jsf/shadcn": ["@xunserver-jsf/core", "@xunserver-jsf/react"],
};

export const REQUIRED_PEERS: Readonly<Partial<Record<FirstPartyPackage, readonly string[]>>> = {
  "@xunserver-jsf/vue": ["vue"],
  "@xunserver-jsf/react": ["react"],
  "@xunserver-jsf/element-plus": ["vue", "element-plus"],
  "@xunserver-jsf/antd": ["react", "antd"],
  "@xunserver-jsf/shadcn": ["react"],
};

export const HOST_PACKAGES = [
  "vue",
  "react",
  "react-dom",
  "element-plus",
  "antd",
  "@ant-design/icons",
] as const;

export const MUI_FORBIDDEN_PACKAGES = [
  "@mui/x-date-pickers",
  "@mui/x-date-pickers-pro",
  "dayjs",
  "luxon",
  "moment",
  "date-fns",
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
  forbiddenMuiXPackage: "forbidden-mui-x-package",
  hostPeerPlacement: "host-peer-placement",
  missingPeer: "missing-peer",
  coreLayout: "core-layout",
  exampleChromeLeak: "example-chrome-leak",
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

export const CORE_COMPILER_SUBDIRS = ["schema", "shape", "data", "ui", "rule", "validation", "dynamics"] as const;
export const CORE_MODEL_SUBDIRS = ["data", "ui", "rule", "validation", "schema-dynamics", "path", "identity"] as const;
export const CORE_RUNTIME_SUBDIRS = [
  "form",
  "value",
  "state",
  "transaction",
  "array",
  "dependency",
  "subscription",
  "scope",
  "rule",
  "validation",
  "dynamics",
] as const;

export const CORE_FORBIDDEN_TOP_LEVEL_DIRS = ["types", "services", "utils"] as const;

export const EXAMPLE_CHROME_PACKAGES = [
  "react",
  "react-dom",
  "monaco-editor",
  "@monaco-editor/react",
  "@dnd-kit/react",
  "@dnd-kit/dom",
  "@dnd-kit/abstract",
  "@dnd-kit/core",
  "@dnd-kit/sortable",
  "tailwindcss",
] as const;

export function isExampleChromePackage(name: string): boolean {
  return (EXAMPLE_CHROME_PACKAGES as readonly string[]).includes(name);
}

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
  if (
    packageName === "@xunserver-jsf/vue" ||
    packageName === "@xunserver-jsf/element-plus"
  ) {
    return "vue";
  }

  if (
    packageName === "@xunserver-jsf/react" ||
    packageName === "@xunserver-jsf/antd" ||
    packageName === "@xunserver-jsf/shadcn"
  ) {
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

export function isMuiForbiddenPackage(name: string): boolean {
  return (MUI_FORBIDDEN_PACKAGES as readonly string[]).includes(name);
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
