import { describe, expect, test } from "vitest";
import { compileV1 } from "../fixtures/v1/index.js";
import { createSelector, subscribeRuntime, valueSelector } from "@form/core/runtime";

describe("v1 selector precision", () => {
  test("V1-PRECISION-FIELD does not recompute an unrelated field selector", () => {
    const { form } = compileV1("explicit");
    let nameRuns = 0;
    let ageRuns = 0;
    const nameSelector = createSelector([valueSelector("name")], (value) => {
      nameRuns += 1;
      return value;
    });
    const ageSelector = createSelector([valueSelector("age")], (value) => {
      ageRuns += 1;
      return value;
    });
    subscribeRuntime(form, nameSelector, () => undefined);
    subscribeRuntime(form, ageSelector, () => undefined);
    nameRuns = 0;
    ageRuns = 0;
    form.setValue("name", "Grace");
    expect(nameRuns).toBe(1);
    expect(ageRuns).toBe(0);
  });

  test("V1-PRECISION-ARRAY does not notify a sibling item selector", () => {
    const { form } = compileV1("explicit");
    const first = form.array("products").items()[0]!;
    const second = form.array("products").items()[1]!;
    let firstRuns = 0;
    let secondRuns = 0;
    const firstSelector = createSelector([valueSelector("products[0].title")], (value) => {
      firstRuns += 1;
      return value;
    });
    const secondSelector = createSelector([valueSelector("products[1].title")], (value) => {
      secondRuns += 1;
      return value;
    });
    subscribeRuntime(form, firstSelector, () => undefined);
    subscribeRuntime(form, secondSelector, () => undefined);
    firstRuns = 0;
    secondRuns = 0;
    form.setValue("products[0].title", "Renamed");
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(0);
    expect(first.id).not.toBe(second.id);
  });
});
