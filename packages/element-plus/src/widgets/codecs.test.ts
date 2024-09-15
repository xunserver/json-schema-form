import { describe, expect, test } from "vitest";
import {
  booleanCodec,
  dateCodec,
  datetimeCodec,
  multiSelectCodec,
  numberCodec,
  selectCodec,
  stringCodec,
} from "./codecs.js";

describe("element-plus codecs", () => {
  test("text and number round-trip and reject malformed output", () => {
    expect(stringCodec.decode(stringCodec.encode("Ada"))).toEqual({ ok: true, value: "Ada" });
    expect(numberCodec.decode(numberCodec.encode(3))).toEqual({ ok: true, value: 3 });
    expect(numberCodec.decode(numberCodec.encode(null))).toEqual({ ok: true, value: null });
    expect(numberCodec.decode(Number.NaN).ok).toBe(false);
    expect(numberCodec.decode(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(stringCodec.decode(1).ok).toBe(false);
  });

  test("select stores scalars and multi-select stores readonly scalar arrays", () => {
    expect(selectCodec.decode("a")).toEqual({ ok: true, value: "a" });
    expect(selectCodec.decode({ label: "A" }).ok).toBe(false);
    const decoded = multiSelectCodec.decode(["a", 1]);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(Object.isFrozen(decoded.value)).toBe(true);
      expect(decoded.value).toEqual(["a", 1]);
    }
    expect(multiSelectCodec.decode([{ value: "a" }]).ok).toBe(false);
  });

  test("boolean codecs only accept booleans", () => {
    expect(booleanCodec.decode(true)).toEqual({ ok: true, value: true });
    expect(booleanCodec.decode("true").ok).toBe(false);
  });

  test("date and datetime stay canonical strings across timezones", () => {
    expect(dateCodec.decode("2026-09-15")).toEqual({ ok: true, value: "2026-09-15" });
    expect(dateCodec.decode(new Date("2026-09-15T00:00:00Z")).ok).toBe(false);
    expect(datetimeCodec.decode("2026-09-15T12:00:00Z")).toEqual({ ok: true, value: "2026-09-15T12:00:00Z" });
    expect(datetimeCodec.decode("2026-09-15T12:00:00+08:00")).toEqual({
      ok: true,
      value: "2026-09-15T12:00:00+08:00",
    });
    expect(datetimeCodec.decode(new Date("2026-09-15T12:00:00Z")).ok).toBe(false);
  });
});
