import { describe, expect, test } from "vitest";
import {
  booleanCodec,
  createMultiSelectCodec,
  createSelectCodec,
  dateCodec,
  datetimeCodec,
  numberCodec,
  selectCodec,
  stringCodec,
} from "./codecs.js";

describe("mui codecs", () => {
  test("text and number round-trip and reject malformed output", () => {
    expect(stringCodec.decode(stringCodec.encode("Ada"))).toEqual({ ok: true, value: "Ada" });
    expect(numberCodec.decode(numberCodec.encode(3))).toEqual({ ok: true, value: 3 });
    expect(numberCodec.decode("")).toEqual({ ok: true, value: null });
    expect(numberCodec.decode("4.5")).toEqual({ ok: true, value: 4.5 });
    expect(numberCodec.decode(Number.NaN).ok).toBe(false);
    expect(numberCodec.decode(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(numberCodec.decode("Infinity").ok).toBe(false);
    expect(stringCodec.decode(1).ok).toBe(false);
  });

  test("select tokens map to scalars and reject option objects and collisions", () => {
    const options = [{ value: 1 }, { value: "1" }] as const;
    const codec = createSelectCodec(options);
    expect(codec.decode(codec.encode(1))).toEqual({ ok: true, value: 1 });
    expect(codec.decode(codec.encode("1"))).toEqual({ ok: true, value: "1" });
    expect(selectCodec.decode({ label: "A" }).ok).toBe(false);
    expect(codec.decode({ value: 1 }).ok).toBe(false);
    const multi = createMultiSelectCodec(options);
    const decoded = multi.decode([codec.encode(1), codec.encode("1")]);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(Object.isFrozen(decoded.value)).toBe(true);
      expect(decoded.value).toEqual([1, "1"]);
    }
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
