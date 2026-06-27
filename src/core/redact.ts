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

const DEFAULT_SOLID_COLOR: RGBA = { r: 0, g: 0, b: 0, a: 255 };
const DEFAULT_BLOCK_SIZE = 16;

/**
 * Return a new image with `region` redacted according to `mode`.
 * The input image is never mutated.
 */
export function redactRegion(image: RasterImage, region: Region, mode: RedactionMode): RasterImage {
  const out = new Uint8ClampedArray(image.data);
  const clamped = clampRegion(region, image.width, image.height);

  if (clamped.width > 0 && clamped.height > 0) {
    if (mode.type === "solid") {
      fillSolid(out, image.width, clamped, mode.color ?? DEFAULT_SOLID_COLOR);
    } else {
      pixelate(out, image.width, clamped, mode.blockSize ?? DEFAULT_BLOCK_SIZE);
    }
  }

  return { data: out, width: image.width, height: image.height };
}

/** Intersect the region with the image, so callers never read or write out of bounds. */
function clampRegion(region: Region, imageWidth: number, imageHeight: number): Region {
  const xStart = Math.max(0, region.x);
  const yStart = Math.max(0, region.y);
  const xEnd = Math.min(imageWidth, region.x + region.width);
  const yEnd = Math.min(imageHeight, region.y + region.height);
  return { x: xStart, y: yStart, width: xEnd - xStart, height: yEnd - yStart };
}

function fillSolid(data: Uint8ClampedArray, imageWidth: number, region: Region, color: RGBA): void {
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * imageWidth + x) * 4;
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = color.a;
    }
  }
}

function pixelate(data: Uint8ClampedArray, imageWidth: number, region: Region, blockSize: number): void {
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
      fillSolid(data, imageWidth, block, averageBlock(data, imageWidth, block));
    }
  }
}

function averageBlock(data: Uint8ClampedArray, imageWidth: number, region: Region): RGBA {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * imageWidth + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      a += data[i + 3];
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
