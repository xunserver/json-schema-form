import { describe, expect, test } from "vitest";
import { compileActivationPredicate } from "./predicate.js";
import type { CanonicalSchemaGraph } from "../schema/frontend.js";
import { ROOT_MODEL_PATH } from "../../model/path/index.js";

const emptyGraph = {
  nodes: new Map(),
} as CanonicalSchemaGraph;

describe("activation predicate compiler", () => {
  test("compiles type, const, enum, presence, and finite logic", () => {
    const result = compileActivationPredicate(
      {
        type: "object",
        required: ["kind"],
        properties: {
          kind: { const: "company" },
          region: { enum: ["CN", "US"] },
        },
        allOf: [{ type: "object" }],
        not: { const: null },
      },
      "",
      ROOT_MODEL_PATH,
      emptyGraph,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.dependencies).toEqual(expect.arrayContaining(["", "kind", "region"]));
    expect(JSON.stringify(result.predicate)).toContain('"const"');
    expect(JSON.stringify(result.predicate)).toContain("present");
  });

  test("rejects unsupported keywords with schema path", () => {
    const result = compileActivationPredicate({ minimum: 1 }, "/if", ROOT_MODEL_PATH, emptyGraph);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.keyword).toBe("minimum");
    expect(result.schemaPath).toBe("/if");
  });
});
