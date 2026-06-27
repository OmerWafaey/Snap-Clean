import type { RGBA } from "../core/redact";

/**
 * Parse a `#rrggbb` string (the format an `<input type="color">` always emits)
 * into an opaque RGBA color.
 */
export function hexToRgba(hex: string): RGBA {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 255,
  };
}
