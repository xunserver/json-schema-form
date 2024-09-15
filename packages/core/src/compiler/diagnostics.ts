import type { Diagnostic, DiagnosticSource } from "../diagnostic/index.js";
import { freezeDiagnostic } from "../diagnostic/freeze.js";
import type { ModelPath, SchemaPath } from "../path/index.js";
import {
  COMPILER_DIAGNOSTIC_CODES,
  DIAGNOSTIC_CODE_RANK,
  SCHEMA_DIAGNOSTIC_CODES,
  type CompileDiagnosticCode,
} from "../model/diagnostic-codes.js";

const SOURCE_RANK: Readonly<Record<DiagnosticSource, number>> = Object.freeze({
  schema: 0,
  compiler: 1,
  plugin: 2,
  adapter: 3,
  runtime: 4,
});

export interface DiagnosticInput {
  readonly code: CompileDiagnosticCode | (string & {});
  readonly severity: Diagnostic["severity"];
  readonly message: string;
  readonly source: DiagnosticSource;
  readonly schemaPath?: SchemaPath;
  readonly modelPath?: ModelPath;
  readonly pluginId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface TrackedDiagnostic {
  readonly diagnostic: Diagnostic;
  readonly ordinal: number;
  readonly sourceRank: number;
  readonly codeRank: number;
  readonly location: string;
}

export class DiagnosticBag {
  private readonly items: TrackedDiagnostic[] = [];
  private ordinal = 0;

  push(input: DiagnosticInput): void {
    const diagnostic: Diagnostic = {
      code: input.code,
      severity: input.severity,
      message: input.message,
      source: input.source,
      ...(input.schemaPath === undefined ? {} : { schemaPath: input.schemaPath }),
      ...(input.modelPath === undefined ? {} : { modelPath: input.modelPath }),
      ...(input.pluginId === undefined ? {} : { pluginId: input.pluginId }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    };

    this.items.push({
      diagnostic,
      ordinal: this.ordinal,
      sourceRank: SOURCE_RANK[input.source],
      codeRank: rankOf(input.code),
      location: locationKey(input.schemaPath, input.modelPath),
    });
    this.ordinal += 1;
  }

  append(diagnostics: readonly Diagnostic[]): void {
    for (const diagnostic of diagnostics) {
      this.push(diagnostic);
    }
  }

  get size(): number {
    return this.items.length;
  }

  hasErrors(): boolean {
    return this.items.some((item) => item.diagnostic.severity === "error");
  }

  snapshot(): readonly Diagnostic[] {
    return Object.freeze(
      this.items
        .slice()
        .sort((left, right) => {
          if (left.sourceRank !== right.sourceRank) {
            return left.sourceRank - right.sourceRank;
          }
          if (left.location !== right.location) {
            return left.location < right.location ? -1 : 1;
          }
          if (left.codeRank !== right.codeRank) {
            return left.codeRank - right.codeRank;
          }
          if (left.diagnostic.code !== right.diagnostic.code) {
            return left.diagnostic.code < right.diagnostic.code ? -1 : 1;
          }
          return left.ordinal - right.ordinal;
        })
        .map((item) => freezeDiagnostic(item.diagnostic)),
    );
  }
}

export function schemaError(
  code: (typeof SCHEMA_DIAGNOSTIC_CODES)[keyof typeof SCHEMA_DIAGNOSTIC_CODES],
  message: string,
  schemaPath: SchemaPath,
  metadata?: Readonly<Record<string, unknown>>,
): DiagnosticInput {
  return {
    code,
    severity: "error",
    message,
    source: "schema",
    schemaPath,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function schemaWarning(
  code: (typeof SCHEMA_DIAGNOSTIC_CODES)[keyof typeof SCHEMA_DIAGNOSTIC_CODES],
  message: string,
  schemaPath: SchemaPath,
  metadata?: Readonly<Record<string, unknown>>,
): DiagnosticInput {
  return {
    code,
    severity: "warning",
    message,
    source: "schema",
    schemaPath,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function compilerError(
  code: (typeof COMPILER_DIAGNOSTIC_CODES)[keyof typeof COMPILER_DIAGNOSTIC_CODES],
  message: string,
  options?: {
    readonly schemaPath?: SchemaPath;
    readonly modelPath?: ModelPath;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): DiagnosticInput {
  return {
    code,
    severity: "error",
    message,
    source: "compiler",
    ...(options?.schemaPath === undefined ? {} : { schemaPath: options.schemaPath }),
    ...(options?.modelPath === undefined ? {} : { modelPath: options.modelPath }),
    ...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
  };
}

export function compilerWarning(
  code: (typeof COMPILER_DIAGNOSTIC_CODES)[keyof typeof COMPILER_DIAGNOSTIC_CODES],
  message: string,
  options?: {
    readonly schemaPath?: SchemaPath;
    readonly modelPath?: ModelPath;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): DiagnosticInput {
  return {
    code,
    severity: "warning",
    message,
    source: "compiler",
    ...(options?.schemaPath === undefined ? {} : { schemaPath: options.schemaPath }),
    ...(options?.modelPath === undefined ? {} : { modelPath: options.modelPath }),
    ...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
  };
}

function rankOf(code: string): number {
  if (code in DIAGNOSTIC_CODE_RANK) {
    return DIAGNOSTIC_CODE_RANK[code as CompileDiagnosticCode];
  }
  return 50;
}

function locationKey(schemaPath?: SchemaPath, modelPath?: ModelPath): string {
  return `${schemaPath ?? ""}\0${modelPath ?? ""}`;
}
