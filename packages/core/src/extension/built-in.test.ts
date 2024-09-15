import { describe, expect, test } from "vitest";
import { BUILTIN_WIDGET_KEYS } from "./widget.js";
import { CORE_PLUGIN_ID } from "./built-in.js";
import { createFormEnvironment } from "./create-form-environment.js";

const FRAMEWORK_PATTERN = /vue|react|element-plus|@mui|document|onclick|addeventlistener|ajv/i;

describe("core built-in plugin", () => {
  const environment = createFormEnvironment();

  test("registers the nine stable logical widget keys", () => {
    expect(environment.pluginIds).toEqual([CORE_PLUGIN_ID]);
    expect([...environment.widgets.keys()]).toEqual([...BUILTIN_WIDGET_KEYS].toSorted());
    for (const key of BUILTIN_WIDGET_KEYS) {
      expect(environment.widgets.get(key)?.name).toBe(key);
    }
  });

  test("describes canonical values, capabilities, and defaults without framework bindings", () => {
    expect(environment.widgets.get("text")?.valueContract.canonical).toBe("json-scalar");
    expect(environment.widgets.get("date")?.valueContract).toMatchObject({
      canonical: "iso-date-string",
      nullable: true,
    });
    expect(environment.widgets.get("datetime")?.valueContract.canonical).toBe("iso-datetime-string");
    expect(environment.widgets.get("multi-select")?.valueContract.canonical).toBe("readonly-collection");
    expect(environment.widgets.get("multi-select")?.capabilities?.multiple).toBe(true);
    expect(environment.widgets.get("checkbox")?.defaults?.value).toBe(false);
    expect(environment.widgets.get("date")?.defaults?.value).toBeNull();

    for (const widget of environment.widgets.values()) {
      expect(JSON.stringify(widget)).not.toMatch(FRAMEWORK_PATTERN);
      expect(widget).not.toHaveProperty("component");
      expect(widget).not.toHaveProperty("onClick");
    }
  });
});
