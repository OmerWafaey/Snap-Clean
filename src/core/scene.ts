import { redactMask, type PixelMask, type RasterImage, type RedactionMode, type Region } from "./redact";

/**
 * A single committed redaction, kept as data rather than baked into pixels: the
 * region it covers, the exact coverage mask, and how it hides (solid / pixelate).
 * The pristine image plus an ordered list of these IS the document — `composite`
 * renders them on top of the original, so a redaction can later be selected,
 * moved, or removed without the original pixels having been destroyed.
 */
export interface Redaction {
  region: Region;
  covers: PixelMask;
  mode: RedactionMode;
}

/**
 * Render the scene: every redaction painted over the original, in order, so a
 * later redaction sits on top of an earlier one. The original is never mutated
 * and never handed back — callers get a fresh, fully-redacted image.
 */
export function composite(original: RasterImage, redactions: Redaction[]): RasterImage {
  return redactions.reduce<RasterImage>(
    (image, redaction) => redactMask(image, redaction.region, redaction.mode, redaction.covers),
    copy(original),
  );
}

/**
 * The index of the redaction under `point`, or null if none covers it. Tests the
 * actual coverage mask (not the bounding box), so a click in an ellipse's empty
 * corner selects nothing. Later redactions sit on top, so we scan from the top
 * down and return the first that covers the point.
 */
export function pickTopmost(redactions: Redaction[], point: { x: number; y: number }): number | null {
  for (let i = redactions.length - 1; i >= 0; i--) {
    if (redactions[i].covers(point.x, point.y)) return i;
  }
  return null;
}

/**
 * The scene with the redaction at `index` removed, as a new list — the input is
 * never mutated and every other redaction is kept in its original order (and thus
 * its stacking order). Deleting re-exposes only what that one redaction hid;
 * nothing else changes, so undo can restore it exactly by keeping the old list.
 */
export function removeRedaction(redactions: Redaction[], index: number): Redaction[] {
  return redactions.filter((_, i) => i !== index);
}

/** A defensive copy of the original, so an empty scene still returns a fresh buffer. */
function copy(image: RasterImage): RasterImage {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}
