import { describe, it, expect } from "vitest";
import { brushCoverage, brushBounds } from "./brush";

describe("brushCoverage", () => {
  it("covers pixels within the radius of a single dab and nothing far away", () => {
    const covers = brushCoverage([{ x: 10, y: 10 }], 4);

    expect(covers(10, 10)).toBe(true); // the dab center
    expect(covers(40, 40)).toBe(false); // well outside the radius
  });

  it("stays continuous between sampled points so a fast drag leaves no gap", () => {
    // Two samples 20px apart with a small radius: the midpoint is >radius from
    // BOTH endpoints, so it can only be covered if the segment itself is tested.
    const covers = brushCoverage([{ x: 10, y: 10 }, { x: 30, y: 10 }], 4);

    expect(covers(20, 10)).toBe(true); // on the segment, far from both ends
    expect(covers(20, 16)).toBe(false); // perpendicular distance > radius
  });

  it("has a hard edge: a pixel is fully in or fully out, never partially covered", () => {
    const covers = brushCoverage([{ x: 10, y: 10 }], 4);

    // crisp boolean transition across the radius — no feathered band that could
    // leak a faint version of the hidden content
    expect(covers(13, 10)).toBe(true);
    expect(covers(14, 10)).toBe(false);
  });

  it.each([2, 48])("keeps a hard edge at radius %d, so a thin or thick stroke never feathers", (radius) => {
    const covers = brushCoverage([{ x: 100, y: 100 }], radius);

    // the last pixel whose centre is within the radius is fully covered, and the
    // very next one out is fully uncovered — a crisp boundary at any slider size
    expect(covers(100 + radius - 1, 100)).toBe(true);
    expect(covers(100 + radius, 100)).toBe(false);
  });
});

describe("brushBounds", () => {
  it("encloses the whole stroke expanded by the radius", () => {
    const bounds = brushBounds([{ x: 10, y: 10 }, { x: 30, y: 20 }], 4);

    expect(bounds).toEqual({ x: 6, y: 6, width: 28, height: 18 });
  });

  it("contains every pixel the coverage marks, so the fill never clips the stroke", () => {
    const path = [{ x: 12, y: 15 }, { x: 40, y: 22 }];
    const radius = 6;
    const bounds = brushBounds(path, radius);
    const covers = brushCoverage(path, radius);

    // scan a margin beyond the bounds; nothing covered may fall outside them
    for (let y = bounds.y - 3; y < bounds.y + bounds.height + 3; y++) {
      for (let x = bounds.x - 3; x < bounds.x + bounds.width + 3; x++) {
        if (!covers(x, y)) continue;
        const inside = x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
        expect(inside).toBe(true);
      }
    }
  });
});
