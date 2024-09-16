import { describe, expect, test } from "vitest";
import { applySemanticSteps, compileV1, compareObservations, observeForm, type ObservationRecord } from "../fixtures/v1/index.js";

describe("v1 cross-stack comparator", () => {
  test("V1-CROSS-STACK-COMPARE equates Core observations without opaque ids", async () => {
    const left = compileV1("explicit");
    const right = compileV1("explicit");
    const leftIds = left.form.array("products").items().map((item) => item.id);
    const rightIds = right.form.array("products").items().map((item) => item.id);
    const submittedLeft = await applySemanticSteps(left.form);
    const submittedRight = await applySemanticSteps(right.form);
    const leftObs = observeForm(left.form, { previousIds: leftIds, submitted: submittedLeft });
    const rightObs = observeForm(right.form, { previousIds: rightIds, submitted: submittedRight });
    expect(compareObservations(leftObs, rightObs)).toEqual([]);
    expect(left.form.array("products").items()[0]?.id).not.toBe(right.form.array("products").items()[0]?.id);
  });

  test("V1-CROSS-STACK-DIFF locates a business difference", () => {
    const left: ObservationRecord = {
      values: { name: "Ada" },
      identities: [{ index: 0, kept: true }],
      effective: {},
      errors: [],
      version: 1,
      serialized: { name: "Ada" },
    };
    const right: ObservationRecord = {
      values: { name: "Grace" },
      identities: [{ index: 0, kept: true }],
      effective: {},
      errors: [],
      version: 1,
      serialized: { name: "Grace" },
    };
    expect(compareObservations(left, right)).toEqual(["values", "serialized"]);
  });
});
