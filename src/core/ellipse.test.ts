import { describe, it, expect } from "vitest";
import { insideEllipse } from "./ellipse";
import type { Region } from "./redact";

describe("insideEllipse", () => {
  const oval: Region = { x: 0, y: 0, width: 10, height: 6 }; // a wide oval, not a circle

  const cases: Array<{ scenario: string; x: number; y: number; expected: boolean }> = [
    { scenario: "the center is inside", x: 5, y: 3, expected: true },
    { scenario: "a point near the wide horizontal edge is inside", x: 1, y: 3, expected: true },
    { scenario: "a point near the short vertical edge is inside", x: 5, y: 1, expected: true },
    { scenario: "the top-left bounding corner is outside (round, not square)", x: 0, y: 0, expected: false },
    { scenario: "the bottom-right bounding corner is outside (round, not square)", x: 9, y: 5, expected: false },
  ];

  it.each(cases)("$scenario", ({ x, y, expected }) => {
    expect(insideEllipse(oval, x, y)).toBe(expected);
  });
});
