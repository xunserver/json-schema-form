import { createSelector, subscribeRuntime, valueSelector } from "@form/core/runtime";
import { describe, expect, test } from "vitest";
import { renderToString } from "react-dom/server";
import { FormRenderer, useRuntimeSelector } from "../index.js";
import { createRecordingAdapter } from "../test-utils/fake-adapter.js";
import { createPersonForm } from "../test-utils/forms.js";

describe("SSR snapshot-only path", () => {
  test("does not install runtime listeners or read browser globals", () => {
    const form = createPersonForm();
    let evaluations = 0;
    const selector = createSelector([valueSelector("name")], (value) => {
      evaluations += 1;
      return value;
    });
    function Probe() {
      const value = useRuntimeSelector(form, selector);
      return <span>{String(value)}</span>;
    }
    const originalDocument = globalThis.document;
    const html = renderToString(
      <div>
        <Probe />
        <FormRenderer form={form} adapter={createRecordingAdapter()} identifierPrefix="ssr" />
      </div>,
    );
    expect(html).toContain("Ada");
    expect(html).not.toMatch(/aitem_|array-item:/i);
    const afterRender = evaluations;
    form.setValue("name", "Grace");
    expect(evaluations).toBe(afterRender);
    expect(globalThis.document).toBe(originalDocument);
    const leaked: unknown[] = [];
    subscribeRuntime(form, valueSelector("name"), (value) => {
      leaked.push(value);
    });
    form.setValue("name", "Linus");
    expect(leaked).toEqual(["Linus"]);
  });
});
