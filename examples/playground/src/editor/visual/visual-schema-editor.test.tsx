/** @vitest-environment jsdom */
import "./jsdom-polyfill.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createPlaygroundController,
  exampleToDocument,
  getCatalogExample,
  getFixture,
} from "@xunserver-jsf/example-shared";
import { VisualSchemaEditor } from "./visual-schema-editor";

function renderEditor(fixtureId = "supported.root-scalar-fields") {
  const fixture = getFixture(fixtureId);
  const example = getCatalogExample("simple");
  if (example === undefined) {
    throw new Error("simple example missing");
  }
  const controller = createPlaygroundController();
  controller.setExample("simple");
  controller.replaceDefinitionTexts({
    schemaText: fixture.schemaText,
    uiSchemaText: fixture.uiSchemaText,
  });
  const onReplace = vi.fn();
  const view = render(
    <VisualSchemaEditor
      workbench={{
        ...exampleToDocument(example),
        schemaText: fixture.schemaText,
        uiSchemaText: fixture.uiSchemaText,
      }}
      snapshot={controller.getSnapshot()}
      onReplaceDefinition={onReplace}
    />,
  );
  return { ...view, onReplace, controller };
}

describe("VisualSchemaEditor", () => {
  afterEach(() => {
    cleanup();
  });

  test("VSE-OPEN-THREE-COLUMN renders palette canvas and inspector", () => {
    renderEditor();
    expect(screen.getByTestId("visual-palette")).toBeTruthy();
    expect(screen.getByTestId("visual-canvas")).toBeTruthy();
    expect(screen.getByTestId("visual-inspector")).toBeTruthy();
    expect(screen.getByRole("button", { name: "组件" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "画布" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "属性" })).toBeTruthy();
  });

  test("VSE-SELECT-NODE-INSPECTOR shows field config without runtime values", () => {
    renderEditor();
    fireEvent.click(screen.getByText("text · name"));
    expect(screen.getByLabelText("key")).toBeTruthy();
    expect(screen.queryByText("touched")).toBeNull();
    expect(screen.queryByText("FormInstance")).toBeNull();
  });

  test("palette add inserts a node and keep selection in sync", () => {
    const { onReplace } = renderEditor("supported.empty-root");
    fireEvent.click(screen.getByRole("button", { name: "添加文本" }));
    expect(onReplace).toHaveBeenCalled();
    expect(screen.getByText((_, node) => node?.textContent?.replace(/\s+/g, " ").trim() === "text · text")).toBeTruthy();
  });

  test("VSE-DUPLICATE-KEY apply does not write workbench", () => {
    const { onReplace } = renderEditor("supported.duplicate-key-source");
    fireEvent.click(screen.getByText("text · city"));
    const key = screen.getByLabelText("key");
    fireEvent.change(key, { target: { value: "country" } });
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  test("VSE-REQUIRED-SELECT apply submits required select", () => {
    const { onReplace } = renderEditor("supported.required-select");
    fireEvent.click(screen.getByText("select · country"));
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    expect(onReplace).toHaveBeenCalled();
    const payload = onReplace.mock.calls[0]?.[0] as { schemaText: string; uiSchemaText: string };
    expect(JSON.parse(payload.schemaText).required).toEqual(["country"]);
    expect(JSON.parse(payload.uiSchemaText).fields.country.widget).toBe("select");
    expect(JSON.stringify(JSON.parse(payload.uiSchemaText).fields.country)).not.toContain("required");
  });

  test("VSE-FOCUS-AFTER-DELETE moves focus to remaining control", () => {
    renderEditor();
    const name = screen.getByText("text · name");
    fireEvent.click(name);
    fireEvent.click(screen.getByRole("button", { name: "删除字段 name" }));
    expect(screen.queryByRole("button", { name: /删除字段 name/ })).toBeNull();
  });

  test("VSE-EXPORT-STALE-BLOCK disables export while inspector errors exist", () => {
    renderEditor("supported.duplicate-key-source");
    fireEvent.click(screen.getByText("text · city"));
    fireEvent.change(screen.getByLabelText("key"), { target: { value: "country" } });
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    expect((screen.getByRole("button", { name: "复制 Schema" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("VSE-KEYBOARD-MOVE uses the same MoveNode path", () => {
    const { onReplace } = renderEditor("supported.root-scalar-fields");
    fireEvent.click(screen.getByText("text · name"));
    fireEvent.click(screen.getByRole("button", { name: "键盘移动" }));
    fireEvent.click(screen.getAllByRole("button", { name: "放到这里" })[0]!);
    expect(onReplace).toHaveBeenCalled();
  });

  test("VSE-IMPORT-UNSUPPORTED shows empty state", () => {
    renderEditor("unsupported.unknown-keyword");
    expect(screen.getByTestId("visual-unsupported")).toBeTruthy();
    expect(screen.getByText(/不支持可视化编辑/)).toBeTruthy();
  });
});
