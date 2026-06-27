import type { Region } from "../core/redact";

/** A unit-length boundary segment between a covered pixel and an uncovered neighbour, in canvas coords. */
export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The boundary of the covered-pixel set within `region`: the unit segments that
 * separate a covered pixel from an uncovered neighbour. Derived from the same
 * `covers` predicate the fill uses, so the outline marks exactly the pixels that
 * will be redacted — for any shape, including a future free-hand brush.
 */
export function maskEdges(region: Region, covers: (x: number, y: number) => boolean): Edge[] {
  const edges: Edge[] = [];
  const endX = region.x + region.width;
  const endY = region.y + region.height;

  for (let y = region.y; y < endY; y++) {
    for (let x = region.x; x < endX; x++) {
      if (!covers(x, y)) continue;
      if (!covers(x, y - 1)) edges.push({ x1: x, y1: y, x2: x + 1, y2: y });
      if (!covers(x, y + 1)) edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
      if (!covers(x - 1, y)) edges.push({ x1: x, y1: y, x2: x, y2: y + 1 });
      if (!covers(x + 1, y)) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
    }
  }

  return edges;
}
