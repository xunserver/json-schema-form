import { describe, expect, test, vi } from "vitest";
import { createGuardedSetActiveTab } from "./tab-guard.js";
import { RENDERER_DIAGNOSTIC_CODES } from "../adapter/diagnostic-codes.js";

describe("createGuardedSetActiveTab", () => {
  test("rejects undeclared tab keys without writing Core", () => {
    const setActiveTab = vi.fn();
    const reportDiagnostic = vi.fn();
    const guarded = createGuardedSetActiveTab({
      adapterId: "test",
      layoutKey: "layout",
      viewId: "view:layout" as never,
      tabs: ["basic", "advanced"],
      setActiveTab,
      reportDiagnostic,
    });
    guarded("other");
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: RENDERER_DIAGNOSTIC_CODES.INVALID_TAB,
      }),
    );
  });

  test("forwards declared tabs and null clears", () => {
    const setActiveTab = vi.fn();
    const guarded = createGuardedSetActiveTab({
      adapterId: "test",
      layoutKey: "object",
      viewId: "view:object" as never,
      tabs: ["basic"],
      setActiveTab,
      reportDiagnostic: vi.fn(),
    });
    guarded("basic");
    guarded(null);
    expect(setActiveTab).toHaveBeenCalledWith("basic");
    expect(setActiveTab).toHaveBeenCalledWith(null);
  });
});
