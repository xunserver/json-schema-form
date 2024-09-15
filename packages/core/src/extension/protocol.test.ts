import { describe, expect, test } from "vitest";
import {
  compareProtocolVersions,
  CORE_EXTENSION_PROTOCOL,
  isProtocolCompatible,
  isWellFormedProtocolVersion,
} from "./protocol.js";

describe("protocol compatibility", () => {
  test("accepts the current 1.0 version at the inclusive minimum and with an open upper bound", () => {
    expect(CORE_EXTENSION_PROTOCOL).toEqual({ major: 1, minor: 0 });
    expect(
      isProtocolCompatible({
        min: { major: 1, minor: 0 },
      }),
    ).toBe(true);
    expect(
      isProtocolCompatible({
        min: { major: 0, minor: 9 },
        maxExclusive: { major: 2, minor: 0 },
      }),
    ).toBe(true);
    expect(compareProtocolVersions({ major: 1, minor: 0 }, { major: 1, minor: 0 })).toBe(0);
  });

  test("rejects versions below min, at or above maxExclusive, and malformed values", () => {
    expect(
      isProtocolCompatible({
        min: { major: 1, minor: 1 },
      }),
    ).toBe(false);
    expect(
      isProtocolCompatible({
        min: { major: 1, minor: 0 },
        maxExclusive: { major: 1, minor: 0 },
      }),
    ).toBe(false);
    expect(
      isProtocolCompatible({
        min: { major: 0, minor: 1 },
        maxExclusive: { major: 1, minor: 0 },
      }),
    ).toBe(false);
    expect(
      isProtocolCompatible({
        min: { major: -1, minor: 0 },
      }),
    ).toBe(false);
    expect(
      isProtocolCompatible({
        min: { major: 1.5, minor: 0 },
      }),
    ).toBe(false);
    expect(isWellFormedProtocolVersion({ major: 1 })).toBe(false);
    expect(isWellFormedProtocolVersion("1.0")).toBe(false);
  });
});
