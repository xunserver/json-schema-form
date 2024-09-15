import { describe, expect, test } from "vitest";
import { ErrorStore } from "./store.js";
import { toValidationError } from "./errors.js";
import { asInstancePath } from "../../path/index.js";
import type { RuntimeNodeId } from "../runtime-node-id.js";

function error(source: "schema" | "custom" | "async" | "server", ownerKey: string, runtimeId: RuntimeNodeId, code: string) {
  return {
    runtimeId,
    error: toValidationError({
      code,
      instancePath: asInstancePath(code),
      source,
      ownerKey,
      ordinal: 0,
    }),
  };
}

describe("ErrorStore owner isolation", () => {
  test("schema custom async rule and server owners do not overwrite each other", () => {
    const store = new ErrorStore();
    const schemaId = "rn:schema" as RuntimeNodeId;
    const customId = "rn:custom" as RuntimeNodeId;
    const asyncId = "rn:async" as RuntimeNodeId;
    const ruleId = "rn:rule" as RuntimeNodeId;
    const serverId = "rn:server" as RuntimeNodeId;
    store.replaceOwner({
      key: "schema:global",
      source: "schema",
      preserveOnChange: false,
      entries: [error("schema", "schema:global", schemaId, "schema")],
    });
    store.replaceOwner({
      key: "custom:plan:a",
      source: "custom",
      preserveOnChange: false,
      entries: [error("custom", "custom:plan:a", customId, "custom")],
    });
    store.replaceOwner({
      key: "async:plan:b",
      source: "async",
      preserveOnChange: false,
      entries: [error("async", "async:plan:b", asyncId, "async")],
    });
    store.replaceOwner({
      key: "rule:r1:x",
      source: "custom",
      preserveOnChange: false,
      entries: [error("custom", "rule:r1:x", ruleId, "rule")],
    });
    store.replaceOwner({
      key: "server:n",
      source: "server",
      preserveOnChange: false,
      entries: [error("server", "server:n", serverId, "server")],
    });
    store.replaceOwner({
      key: "custom:plan:a",
      source: "custom",
      preserveOnChange: false,
      entries: [error("custom", "custom:plan:a", customId, "custom-2")],
    });
    expect(store.directErrors(schemaId)[0]?.source).toBe("schema");
    expect(store.directErrors(customId)[0]?.code).toBe("custom-2");
    expect(store.directErrors(asyncId)[0]?.source).toBe("async");
    expect(store.directErrors(ruleId)[0]?.code).toBe("rule");
    expect(store.directErrors(serverId)[0]?.source).toBe("server");
    store.removeWhere((record) => record.source === "server");
    expect(store.directErrors(serverId)).toEqual([]);
    expect(store.directErrors(schemaId)).toHaveLength(1);
  });
});
