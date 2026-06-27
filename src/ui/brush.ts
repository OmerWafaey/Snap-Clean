import type { Point } from "./geometry";
import type { PixelMask, Region } from "../core/redact";

/**
 * Coverage for a free-hand brush stroke: a pixel is redacted when its centre lies
 * within `radius` of the stroke path (the polyline through the sampled points).
 * Testing against the segments — not just the sampled points — keeps the stroke
 * continuous on fast drags. The edge is hard: a pixel is fully in or fully out,
 * so nothing along the boundary is left semi-redacted.
 */
export function brushCoverage(path: Point[], radius: number): PixelMask {
  const radiusSquared = radius * radius;
  return (x, y) => distanceSquaredToPath(x + 0.5, y + 0.5, path) <= radiusSquared;
}

/**
 * The bounding box of the stroke, grown by the radius and snapped to whole
 * pixels, so iterating it covers every pixel `brushCoverage` can mark.
 */
export function brushBounds(path: Point[], radius: number): Region {
  const xs = path.map((point) => point.x);
  const ys = path.map((point) => point.y);
  const x = Math.floor(Math.min(...xs) - radius);
  const y = Math.floor(Math.min(...ys) - radius);
  const right = Math.ceil(Math.max(...xs) + radius);
  const bottom = Math.ceil(Math.max(...ys) + radius);
  return { x, y, width: right - x, height: bottom - y };
}

function distanceSquaredToPath(px: number, py: number, path: Point[]): number {
  if (path.length === 1) return distanceSquaredToPoint(px, py, path[0]);

  let nearest = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    nearest = Math.min(nearest, distanceSquaredToSegment(px, py, path[i], path[i + 1]));
  }
  return nearest;
}

function distanceSquaredToPoint(px: number, py: number, point: Point): number {
  const dx = px - point.x;
  const dy = py - point.y;
  return dx * dx + dy * dy;
}

/** Squared distance from (px, py) to the segment a–b, clamped to the segment ends. */
function distanceSquaredToSegment(px: number, py: number, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared === 0) return distanceSquaredToPoint(px, py, a);

  const t = ((px - a.x) * abx + (py - a.y) * aby) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  const cx = a.x + clamped * abx;
  const cy = a.y + clamped * aby;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}
