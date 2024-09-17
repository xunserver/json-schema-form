/** @vitest-environment jsdom */
import "./jsdom-polyfill.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";

function Smoke() {
  const drag = useDraggable({ id: "source" });
  const drop = useDroppable({ id: "target" });
  return (
    <div>
      <button type="button" ref={drag.ref}>
        drag
      </button>
      <div ref={drop.ref}>drop</div>
    </div>
  );
}

describe("dnd-kit react 19 smoke", () => {
  afterEach(() => {
    cleanup();
  });

  test("DragDropProvider mounts pointer/keyboard-capable hooks", () => {
    render(
      <DragDropProvider>
        <Smoke />
      </DragDropProvider>,
    );
    expect(screen.getByText("drag")).toBeTruthy();
    expect(screen.getByText("drop")).toBeTruthy();
  });
});
