import { describe, it, expect } from "vitest";
import { captureSettings, type ControlValues } from "./settings";

const base: ControlValues = { mode: "solid", shape: "rectangle", color: "#000000", strength: 50, size: 12 };

describe("captureSettings", () => {
  it("captures blur as a pixelate mode whose block size comes from the strength", () => {
    const settings = captureSettings({ ...base, mode: "pixelate", strength: 100 });

    expect(settings.mode).toEqual({ type: "pixelate", blockSize: 24 });
  });

  it("captures solid as an opaque color, ignoring strength (never weakens a solid redaction)", () => {
    const settings = captureSettings({ ...base, mode: "solid", color: "#ff8800", strength: 0 });

    expect(settings.mode).toEqual({ type: "solid", color: { r: 255, g: 136, b: 0, a: 255 } });
  });

  it.each([
    ["ellipse", "ellipse"],
    ["rectangle", "rectangle"],
    ["brush", "brush"],
    ["", "rectangle"], // unknown/missing selection falls back to rectangle
  ])("captures shape %s as %s", (selected, expected) => {
    expect(captureSettings({ ...base, shape: selected }).shape).toBe(expected);
  });

  it.each([
    [30, 30], // in range — used as-is
    [2, 2], // lower bound
    [48, 48], // upper bound
    [NaN, 12], // blank slider parses to NaN — fall back to the default
    [1, 12], // below range — fall back, never a thinner-than-allowed stroke
    [49, 12], // above range — fall back to the default
  ])("captures brush size %d as radius %d (out-of-range/blank → default 12)", (size, expected) => {
    expect(captureSettings({ ...base, size }).radius).toBe(expected);
  });
});
