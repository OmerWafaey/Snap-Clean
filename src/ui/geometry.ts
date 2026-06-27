import type { Region } from "../core/redact";

export interface Point {
  x: number;
  y: number;
}

/**
 * Turn two drag endpoints into a normalized region with its origin at the
 * top-left and non-negative width/height, regardless of drag direction.
 */
export function normalizeRect(start: Point, end: Point): Region {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
