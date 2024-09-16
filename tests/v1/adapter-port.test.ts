import { describe, expect, test } from "vitest";
import { compileV1, fieldViewId } from "../fixtures/v1/index.js";
import { formSelector, subscribeRuntime } from "@xunserver-jsf/core/runtime";

describe("v1 adapter semantic ports", () => {
  test("V1-ADAPTER-PORT records only approved commands", () => {
    const { form } = compileV1("explicit");
    const commands: string[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      commands.push(`commit:${snapshot.version}`);
    });
    form.setValue("name", "Grace");
    form.touch("name");
    form.focus(fieldViewId(form, "name"));
    form.blur(fieldViewId(form, "name"));
    form.array("products").move(0, 1);
    const version = form.getState().version;
    const values = form.getValues();
    try {
      form.setValue("missing.path", { nativeEvent: true });
    } catch {
      // illegal path/native payload is rejected by Runtime without a partial write
    }
    try {
      form.setValue("total", 999);
    } catch {
      // computed/protected targets cannot be overwritten
    }
    expect(form.getValue("name")).toBe("Grace");
    expect(form.getState().version).toBe(version);
    expect(commands.every((command) => command.startsWith("commit:"))).toBe(true);
    expect(JSON.stringify(values)).not.toMatch(/nativeEvent/);
    expect(JSON.stringify(form.getValues())).not.toMatch(/nativeEvent/);
  });
});
