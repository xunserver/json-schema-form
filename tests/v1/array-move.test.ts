import { describe, expect, test } from "vitest";
import { compileV1, fieldViewId } from "../fixtures/v1/index.js";
import { getRenderScope, getRuntimeSnapshot, viewSelector } from "@xunserver-jsf/core/runtime";

describe("v1 array identity across capabilities", () => {
  test("V1-ARRAY-MOVE-STATE follows ArrayItemId through move remove replace and reset", async () => {
    const { form } = compileV1("explicit");
    const first = form.array("products").items()[0]!;
    const titlePath = "products[0].title";
    form.setValue(titlePath, "Alpha");
    form.touch(titlePath);
    form.focus(fieldViewId(form, "products[].title"));
    form.setCollapsed(form.model.ui.viewTree.id, true);
    await form.validate();
    form.applyErrors([{ code: "server.taken", instancePath: "products[0].title", message: "taken" }]);
    const scope = getRenderScope(form).item(first.id, "products");
    form.array("products").move(0, 1);
    expect(form.array("products").items()[1]?.id).toBe(first.id);
    expect(form.getValue("products[1].title")).toBe("Alpha");
    expect(form.getField("products[1].title").getState().touched).toBe(true);
    expect(scope.binding.path).toBe("products[1]");
    expect(scope.binding.stale).toBe(false);
    expect(getRuntimeSnapshot(form, viewSelector(form.model.ui.viewTree.id)).collapsed).toBe(true);
    form.array("products").remove(1);
    expect(scope.binding.stale).toBe(true);
    form.array("products").replaceItem(0, { title: "Z", quantity: 9, lineTotal: 9 });
    expect(form.getField("products[0].title").getState().touched).toBe(false);
    form.reset();
    expect(form.array("products").items()[0]?.id).not.toBe(first.id);
  });
});
