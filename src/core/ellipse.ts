import type { Region } from "./redact";

/**
 * Is the pixel at (x, y) inside the ellipse inscribed in `region`'s bounding
 * box? Uses the pixel center so the test is symmetric. The edge is hard: a
 * pixel is fully in or fully out, so no boundary pixel is left semi-redacted.
 */
export function insideEllipse(region: Region, x: number, y: number): boolean {
  const rx = region.width / 2;
  const ry = region.height / 2;
  const dx = x + 0.5 - (region.x + rx);
  const dy = y + 0.5 - (region.y + ry);
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}
