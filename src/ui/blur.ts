/**
 * Map a blur "strength" percentage (0–100) to a pixelate block size.
 *
 * Strength feeds ONLY the blur block size — never solid redaction, which stays
 * fully opaque. Keeping this mapping isolated is what prevents a shared strength
 * control from ever weakening a solid redaction.
 */
const MIN_BLOCK = 4;
const MAX_BLOCK = 24;

export function blurBlockSize(strength: number): number {
  return Math.max(MIN_BLOCK, Math.round((MAX_BLOCK * strength) / 100));
}
