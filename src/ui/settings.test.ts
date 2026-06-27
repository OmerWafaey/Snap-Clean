import { describe, it, expect } from "vitest";
import { captureSettings, type ControlValues } from "./settings";

const base: ControlValues = { mode: "solid", shape: "rectangle", color: "#000000", strength: 50 };

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
});
