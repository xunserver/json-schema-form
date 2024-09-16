import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, test } from "vitest";
import { FormRenderer } from "@xunserver-jsf/vue";
import { createDemoForm } from "../../examples/shared/src/demo.ts";
import { createDemoRendererEnvironment } from "../lib/demo-element-plus-environment.ts";
import { subscribeRuntime, valueSelector } from "@xunserver-jsf/core/runtime";

describe("vue + element-plus SSR", () => {
  test("server render is deterministic and does not leak listeners", async () => {
    const form = createDemoForm();
    const environment = createDemoRendererEnvironment();
    const html = await renderToString(
      createSSRApp({
        setup() {
          return () => h(FormRenderer, { form, environment, adapterId: "element-plus" });
        },
      }),
    );
    expect(html).toContain("姓名");
    expect(html).toContain("aria-labelledby");
    expect(html).toContain('value="USD"');
    const leaked: unknown[] = [];
    subscribeRuntime(form, valueSelector("name"), (value) => {
      leaked.push(value);
    });
    form.setValue("name", "Grace");
    expect(leaked).toEqual(["Grace"]);
  });
});
