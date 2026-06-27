import { describe, it, expect } from "vitest";
import { normalizeRect, type Point } from "./geometry";

describe("normalizeRect", () => {
  it("builds a region from a top-left to bottom-right drag", () => {
    const start: Point = { x: 10, y: 20 };
    const end: Point = { x: 40, y: 60 };

    expect(normalizeRect(start, end)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("normalizes a reversed drag to a top-left origin with positive size", () => {
    const start: Point = { x: 40, y: 60 }; // user dragged up-and-left
    const end: Point = { x: 10, y: 20 };

    expect(normalizeRect(start, end)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("returns a zero-size region for a click without a drag", () => {
    const point: Point = { x: 15, y: 25 };

    expect(normalizeRect(point, point)).toEqual({ x: 15, y: 25, width: 0, height: 0 });
  });
});
