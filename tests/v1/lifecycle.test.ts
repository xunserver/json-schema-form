import { describe, expect, test } from "vitest";
import { compileV1 } from "../fixtures/v1/index.js";
import { semanticFingerprint } from "../fixtures/v1/fingerprint.js";
import { subscribeRuntime, valueSelector } from "@xunserver-jsf/core/runtime";

describe("v1 model reuse", () => {
  test("V1-MODEL-REUSE-FINGERPRINT keeps compile inspection deterministic", () => {
    const first = compileV1("explicit");
    const second = compileV1("explicit");
    expect(semanticFingerprint(first.model)).toBe(semanticFingerprint(second.model));
    expect(() => {
      (first.model as { diagnostics: unknown }).diagnostics = [];
    }).toThrow();
  });

  test("V1-MODEL-REUSE-ISOLATION keeps FormInstance state independent", () => {
    const shared = compileV1("explicit");
    const other = compileV1("explicit");
    const seen: unknown[] = [];
    subscribeRuntime(other.form, valueSelector("name"), (value) => {
      seen.push(value);
    });
    const version = other.form.getState().version;
    shared.form.setValue("name", "Grace");
    shared.form.array("products").move(0, 1);
    expect(other.form.getValue("name")).toBe("Ada");
    expect(other.form.getState().version).toBe(version);
    expect(other.form.array("products").items()[0]?.id).not.toBe(shared.form.array("products").items()[0]?.id);
    expect(seen).toEqual([]);
  });
});
