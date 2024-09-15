import type { JsonValue } from "../../definition/json-value.js";
import type { SchemaPath } from "../../model/path/index.js";
import { asSchemaPath } from "../../model/path/index.js";
import type { ValidationError, ValidationErrorSource } from "../../validation/error.js";
import type { CustomValidatorIssue, SchemaAdapterIssue } from "../../validation/protocol.js";
import { cloneJsonValue, JsonCloneError } from "../value/json-value.js";
import type { InstancePath, ModelPath } from "../../model/path/index.js";

export const EMPTY_ERRORS: readonly ValidationError[] = Object.freeze([]);

const SOURCE_RANK: Readonly<Record<ValidationErrorSource, number>> = {
  schema: 0,
  custom: 1,
  async: 2,
  server: 3,
};

export interface NormalizedIssue {
  readonly code: string;
  readonly instancePath: InstancePath;
  readonly modelPath?: ModelPath;
  readonly message?: string;
  readonly keyword?: string;
  readonly params?: JsonValue;
  readonly validatorId?: string;
  readonly schemaPath?: SchemaPath;
  readonly source: ValidationErrorSource;
  readonly ownerKey: string;
  readonly ordinal: number;
}

export function cloneIssueParams(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return cloneJsonValue(value);
  } catch (error) {
    if (error instanceof JsonCloneError) {
      throw error;
    }
    throw new JsonCloneError("non-json");
  }
}

export function readMissingProperty(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return undefined;
  }
  const missing = (params as { missingProperty?: unknown }).missingProperty;
  return typeof missing === "string" ? missing : undefined;
}

export function stableParamsKey(params: JsonValue | undefined): string {
  if (params === undefined) {
    return "";
  }
  return JSON.stringify(params);
}

export function issueIdentity(issue: NormalizedIssue): string {
  return [
    issue.source,
    issue.ownerKey,
    issue.code,
    issue.keyword ?? "",
    stableParamsKey(issue.params),
    String(issue.ordinal),
  ].join("\0");
}

export function toValidationError(issue: NormalizedIssue, previous?: ValidationError): ValidationError {
  const id = issueIdentity(issue);
  if (
    previous !== undefined &&
    previous.id === id &&
    previous.message === issue.message &&
    previous.validatorId === issue.validatorId &&
    previous.schemaPath === issue.schemaPath
  ) {
    return previous;
  }
  return Object.freeze({
    id,
    code: issue.code,
    source: issue.source,
    instancePath: issue.instancePath,
    ...(issue.modelPath === undefined ? {} : { modelPath: issue.modelPath }),
    ...(issue.message === undefined ? {} : { message: issue.message }),
    ...(issue.keyword === undefined ? {} : { keyword: issue.keyword }),
    ...(issue.params === undefined ? {} : { params: issue.params }),
    ...(issue.validatorId === undefined ? {} : { validatorId: issue.validatorId }),
    ...(issue.schemaPath === undefined ? {} : { schemaPath: issue.schemaPath }),
  });
}

export function sortErrors(
  errors: readonly ValidationError[],
  dataOrder: ReadonlyMap<string, number>,
  planOrder: ReadonlyMap<string, number>,
): ValidationError[] {
  return errors.slice().sort((left, right) => {
    const leftOrder = dataOrder.get(left.instancePath) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = dataOrder.get(right.instancePath) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (SOURCE_RANK[left.source] !== SOURCE_RANK[right.source]) {
      return SOURCE_RANK[left.source] - SOURCE_RANK[right.source];
    }
    const leftPlan = planOrder.get(left.validatorId ?? left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPlan = planOrder.get(right.validatorId ?? right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftPlan !== rightPlan) {
      return leftPlan - rightPlan;
    }
    if (left.code !== right.code) {
      return left.code < right.code ? -1 : 1;
    }
    if (left.id !== right.id) {
      return left.id < right.id ? -1 : 1;
    }
    return 0;
  });
}

export function customIssuesFromUnknown(value: unknown): readonly CustomValidatorIssue[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new JsonCloneError("non-json");
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new JsonCloneError("non-json");
    }
    const record = item as CustomValidatorIssue;
    if (typeof record.code !== "string" || record.code.length === 0) {
      throw new JsonCloneError("non-json");
    }
    void index;
    return record;
  });
}

export function schemaIssuesFromUnknown(value: unknown): readonly SchemaAdapterIssue[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new JsonCloneError("non-json");
  }
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new JsonCloneError("non-json");
    }
    const record = item as SchemaAdapterIssue;
    if (typeof record.code !== "string" || record.code.length === 0) {
      throw new JsonCloneError("non-json");
    }
    if (typeof record.instancePath !== "string") {
      throw new JsonCloneError("non-json");
    }
    return record;
  });
}

export function asOptionalSchemaPath(value: string | undefined): SchemaPath | undefined {
  return value === undefined ? undefined : asSchemaPath(value);
}
