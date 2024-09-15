import type { AdapterId, NativeFieldOptions } from "../../definition/ui-schema.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import type { ModelPath } from "../../path/index.js";
import { CloneShapeError, clonePlain } from "../immutable.js";
import { DiagnosticBag, compilerError } from "../diagnostics.js";

const RESERVED_NATIVE_KEYS = new Set(["value", "disabled", "readonly", "errors", "required"]);

export function compileNativeOptions(
  native: Readonly<Record<AdapterId, NativeFieldOptions>> | undefined,
  path: ModelPath,
  diagnostics: DiagnosticBag,
): Readonly<Record<AdapterId, NativeFieldOptions>> | undefined {
  if (native === undefined) {
    return undefined;
  }

  const result: Record<string, NativeFieldOptions> = {};
  for (const adapterId of Object.keys(native)) {
    if (adapterId.trim() === "") {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.NATIVE_INVALID, "Adapter ID must be a non-empty string", {
          modelPath: path,
          metadata: { adapterId },
        }),
      );
      continue;
    }
    const options = native[adapterId];
    if (options === undefined) {
      continue;
    }
    for (const key of Object.keys(options)) {
      if (RESERVED_NATIVE_KEYS.has(key)) {
        diagnostics.push(
          compilerError(
            COMPILER_DIAGNOSTIC_CODES.NATIVE_RESERVED_KEY,
            `native options for "${adapterId}" must not declare reserved key "${key}"`,
            {
              modelPath: path,
              metadata: { adapterId, key },
            },
          ),
        );
      }
    }
    try {
      result[adapterId] = clonePlain(options, true);
    } catch (error) {
      const reason = error instanceof CloneShapeError ? error.reason : "non-plain-object";
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.NATIVE_INVALID, `native options for "${adapterId}" are not snapshot-safe`, {
          modelPath: path,
          metadata: { adapterId, reason },
        }),
      );
    }
  }

  return Object.freeze(result);
}
