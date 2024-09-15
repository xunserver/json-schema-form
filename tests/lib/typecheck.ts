import path from "node:path";
import ts from "typescript";

export function loadTsconfig(tsconfigPath: string): ts.ParsedCommandLine {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
}

export function typecheckProject(tsconfigPath: string): ts.Diagnostic[] {
  const parsed = loadTsconfig(tsconfigPath);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  return [...ts.getPreEmitDiagnostics(program)];
}

export function typecheckFiles(
  rootNames: string[],
  compilerOptions: ts.CompilerOptions,
): ts.Diagnostic[] {
  const program = ts.createProgram({
    rootNames,
    options: { ...compilerOptions, noEmit: true },
  });
  return [...ts.getPreEmitDiagnostics(program)];
}

export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  });
}
