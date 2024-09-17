/** @vitest-environment jsdom */
import "./visual/jsdom-polyfill.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("./json-workbench-editor", () => ({
  JsonWorkbenchEditor: ({
    value,
    onChange,
    activeTab,
  }: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly activeTab: string;
  }) => (
    <textarea aria-label={`monaco-${activeTab}`} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { PlaygroundApp } from "./playground-app";

describe("PlaygroundApp visual mode", () => {
  afterEach(() => {
    cleanup();
  });

  test("VSE-OPEN-THREE-COLUMN can switch to visual mode", () => {
    render(<PlaygroundApp />);
    fireEvent.click(screen.getByRole("tab", { name: "可视化" }));
    expect(screen.getByTestId("visual-unsupported")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "文本" }));
    expect(screen.getByLabelText(/monaco-/)).toBeTruthy();
  });

  test("can hide and restore the preview column", () => {
    render(<PlaygroundApp />);
    expect(screen.getByRole("tab", { name: "Element Plus" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "隐藏预览" }));
    expect(screen.getByRole("button", { name: "显示预览", expanded: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "显示预览" }));
    expect(screen.getByRole("button", { name: "隐藏预览", expanded: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Element Plus" })).toBeTruthy();
  });
});
