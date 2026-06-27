import { describe, it, expect } from "vitest";
import { hexToRgba } from "./color";
import type { RGBA } from "../core/redact";

describe("hexToRgba", () => {
  const cases: Array<{ scenario: string; hex: string; expected: RGBA }> = [
    { scenario: "a representative color", hex: "#1b2a3a", expected: { r: 27, g: 42, b: 58, a: 255 } },
    { scenario: "channel order is kept (red, not blue)", hex: "#ff0000", expected: { r: 255, g: 0, b: 0, a: 255 } },
    { scenario: "leading-zero hex pairs", hex: "#0a141e", expected: { r: 10, g: 20, b: 30, a: 255 } },
  ];

  it.each(cases)("parses $scenario into an opaque RGBA color", ({ hex, expected }) => {
    expect(hexToRgba(hex)).toEqual(expected);
  });
});
