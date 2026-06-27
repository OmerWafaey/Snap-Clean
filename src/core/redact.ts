import { insideEllipse } from "./ellipse";

/**
 * A raster image as raw RGBA pixels. The browser's `ImageData` satisfies this
 * structurally, so the core stays pure and testable without a real canvas.
 */
export interface RasterImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type RedactionMode =
  | { type: "solid"; color?: RGBA }
  | { type: "pixelate"; blockSize?: number };

export type Shape = "rectangle" | "ellipse";

/** Whether the pixel at absolute (x, y) belongs to the redacted area. */
export type PixelMask = (x: number, y: number) => boolean;

const DEFAULT_SOLID_COLOR: RGBA = { r: 0, g: 0, b: 0, a: 255 };
const DEFAULT_BLOCK_SIZE = 16;

/**
 * Return a new image with `region` redacted according to `mode`.
 * The input image is never mutated.
 */
export function redactRegion(
  image: RasterImage,
  region: Region,
  mode: RedactionMode,
  shape: Shape = "rectangle",
): RasterImage {
  // The mask is defined by the user's full region, so an off-image ellipse
  // keeps its true curve; redactMask clamps iteration to the image bounds.
  return redactMask(image, region, mode, shapeCoverage(shape, region));
}

/**
 * Return a new image with the pixels selected by `mask` (within `region`)
 * redacted according to `mode`. The mask is any coverage predicate — a shape,
 * or a free-hand brush stroke — so every redaction path shares this one fill.
 * The input image is never mutated.
 */
export function redactMask(
  image: RasterImage,
  region: Region,
  mode: RedactionMode,
  mask: PixelMask,
): RasterImage {
  const out = new Uint8ClampedArray(image.data);
  const surface: Surface = { data: out, width: image.width };
  const clamped = clampRegion(region, image.width, image.height);

  if (clamped.width > 0 && clamped.height > 0) {
    if (mode.type === "solid") {
      fillSolid(surface, clamped, mode.color ?? DEFAULT_SOLID_COLOR, mask);
    } else {
      pixelate(surface, clamped, mode.blockSize ?? DEFAULT_BLOCK_SIZE, mask);
    }
  }

  return { data: out, width: image.width, height: image.height };
}

/** A writable RGBA raster: the pixel buffer paired with its row width. */
interface Surface {
  readonly data: Uint8ClampedArray;
  readonly width: number;
}

/**
 * The coverage predicate for a shape within `region`: which pixels get redacted.
 * Self-bounding (false outside the region), so it doubles as the source for both
 * the fill and the drag outline — keeping the previewed and redacted pixels identical.
 */
export function shapeCoverage(shape: Shape, region: Region): PixelMask {
  if (shape === "ellipse") return (x, y) => insideEllipse(region, x, y);
  const endX = region.x + region.width;
  const endY = region.y + region.height;
  return (x, y) => x >= region.x && x < endX && y >= region.y && y < endY;
}

/** Intersect the region with the image, so callers never read or write out of bounds. */
function clampRegion(region: Region, imageWidth: number, imageHeight: number): Region {
  const xStart = Math.max(0, region.x);
  const yStart = Math.max(0, region.y);
  const xEnd = Math.min(imageWidth, region.x + region.width);
  const yEnd = Math.min(imageHeight, region.y + region.height);
  return { x: xStart, y: yStart, width: xEnd - xStart, height: yEnd - yStart };
}

function fillSolid(surface: Surface, region: Region, color: RGBA, mask: PixelMask): void {
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (!mask(x, y)) continue;
      const i = (y * surface.width + x) * 4;
      surface.data[i] = color.r;
      surface.data[i + 1] = color.g;
      surface.data[i + 2] = color.b;
      surface.data[i + 3] = color.a;
    }
  }
}

function pixelate(surface: Surface, region: Region, blockSize: number, mask: PixelMask): void {
  const endX = region.x + region.width;
  const endY = region.y + region.height;

  for (let blockY = region.y; blockY < endY; blockY += blockSize) {
    for (let blockX = region.x; blockX < endX; blockX += blockSize) {
      const block: Region = {
        x: blockX,
        y: blockY,
        width: Math.min(blockX + blockSize, endX) - blockX,
        height: Math.min(blockY + blockSize, endY) - blockY,
      };
      fillSolid(surface, block, averageBlock(surface, block), mask);
    }
  }
}

function averageBlock(surface: Surface, region: Region): RGBA {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * surface.width + x) * 4;
      r += surface.data[i];
      g += surface.data[i + 1];
      b += surface.data[i + 2];
      a += surface.data[i + 3];
      count++;
    }
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
    a: Math.round(a / count),
  };
}
