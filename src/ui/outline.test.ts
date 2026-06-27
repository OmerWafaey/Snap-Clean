import { describe, it, expect } from "vitest";
import { maskEdges, type Edge } from "./outline";
import { insideEllipse } from "../core/ellipse";
import type { Region } from "../core/redact";

/** Serialize edges to a sorted key list so assertions are order-independent. */
function keys(edges: Edge[]): string[] {
  return edges.map((e) => `${e.x1},${e.y1}-${e.x2},${e.y2}`).sort();
}

describe("maskEdges", () => {
  it("outlines a single covered pixel with its four unit edges", () => {
    const region: Region = { x: 0, y: 0, width: 1, height: 1 };

    const edges = maskEdges(region, (x, y) => x === 0 && y === 0);

    expect(keys(edges)).toEqual(["0,0-0,1", "0,0-1,0", "0,1-1,1", "1,0-1,1"]);
  });

  it("traces only the perimeter of a 2x2 block, suppressing the shared interior edges", () => {
    const region: Region = { x: 0, y: 0, width: 2, height: 2 };

    // A rectangle's coverage is bounded to the region — not "always true", or the
    // outside neighbours would count as covered and no boundary would be drawn.
    const edges = maskEdges(region, (x, y) => x >= 0 && x < 2 && y >= 0 && y < 2);

    expect(keys(edges)).toEqual([
      "0,0-0,1", "0,0-1,0", "0,1-0,2", "0,2-1,2",
      "1,0-2,0", "1,2-2,2", "2,0-2,1", "2,1-2,2",
    ]);
    expect(edges).toHaveLength(8); // 4 pixels x 4 sides minus 8 shared interior edges
  });

  it("cuts a staircase notch where an ellipse excludes its bounding corners", () => {
    // A 4x4 circle covers a plus shape: the four corners are excluded, so the
    // outline steps inward at each corner instead of following a smooth curve.
    const region: Region = { x: 0, y: 0, width: 4, height: 4 };

    const edges = maskEdges(region, (x, y) => insideEllipse(region, x, y));
    const k = keys(edges);

    expect(edges).toHaveLength(16);
    // the top-left corner notch: left side of (1,0) and top side of (0,1) meet at (1,1)
    expect(k).toContain("1,0-1,1");
    expect(k).toContain("0,1-1,1");
  });
});
