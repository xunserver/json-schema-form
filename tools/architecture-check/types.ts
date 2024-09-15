export interface ArchitectureDiagnostic {
  sourcePackage: string;
  targetPackage: string;
  rule: string;
  message: string;
  file?: string;
  specifier?: string;
}

export interface PackageManifest {
  name?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface DiscoveredPackage {
  name: string;
  directory: string;
  manifest: PackageManifest;
}
