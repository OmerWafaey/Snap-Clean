import { describe, it, expect } from "vitest";
import { redactRegion, type RasterImage, type Shape } from "./redact";

/** Build a solid-color test image so assertions read clearly. */
function makeImage(width: number, height: number, fill: [number, number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height };
}

/** Read the RGBA tuple at (x, y). */
function pixelAt(image: RasterImage, x: number, y: number): [number, number, number, number] {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

/** Build an image from an explicit list of RGBA tuples in row-major order. */
function imageFromPixels(width: number, height: number, pixels: Array<[number, number, number, number]>): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((p, idx) => {
    data[idx * 4] = p[0];
    data[idx * 4 + 1] = p[1];
    data[idx * 4 + 2] = p[2];
    data[idx * 4 + 3] = p[3];
  });
  return { data, width, height };
}

describe("redactRegion - solid", () => {
  it("paints the region with the chosen color and leaves outside pixels untouched", () => {
    const image = makeImage(4, 4, [255, 255, 255, 255]); // all white
    const result = redactRegion(
      image,
      { x: 1, y: 1, width: 2, height: 2 },
      { type: "solid", color: { r: 10, g: 20, b: 30, a: 255 } },
    );

    // inside the region -> chosen color
    expect(pixelAt(result, 1, 1)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(result, 2, 2)).toEqual([10, 20, 30, 255]);

    // outside the region -> still white
    expect(pixelAt(result, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(result, 3, 3)).toEqual([255, 255, 255, 255]);
  });

  it("defaults to opaque black when no color is given", () => {
    const image = makeImage(4, 4, [255, 255, 255, 255]);
    const result = redactRegion(image, { x: 0, y: 0, width: 2, height: 2 }, { type: "solid" });

    expect(pixelAt(result, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(result, 1, 1)).toEqual([0, 0, 0, 255]);
  });
});

describe("redactRegion - pixelate", () => {
  it("replaces each block inside the region with that block's average color", () => {
    // 2x2 image, one 2x2 block. Channel values 0,40,80,120 -> average 60.
    const image = imageFromPixels(2, 2, [
      [0, 0, 0, 255],
      [40, 40, 40, 255],
      [80, 80, 80, 255],
      [120, 120, 120, 255],
    ]);

    const result = redactRegion(image, { x: 0, y: 0, width: 2, height: 2 }, { type: "pixelate", blockSize: 2 });

    expect(pixelAt(result, 0, 0)).toEqual([60, 60, 60, 255]);
    expect(pixelAt(result, 1, 0)).toEqual([60, 60, 60, 255]);
    expect(pixelAt(result, 0, 1)).toEqual([60, 60, 60, 255]);
    expect(pixelAt(result, 1, 1)).toEqual([60, 60, 60, 255]);
  });
});

describe("redactRegion - ellipse shape", () => {
  it("redacts inside the inscribed ellipse and leaves the bounding-box corners untouched", () => {
    const image = makeImage(10, 6, [255, 255, 255, 255]); // all white
    const region = { x: 0, y: 0, width: 10, height: 6 };

    const result = redactRegion(image, region, { type: "solid", color: { r: 0, g: 0, b: 0, a: 255 } }, "ellipse");

    // inside the ellipse -> redacted
    expect(pixelAt(result, 5, 3)).toEqual([0, 0, 0, 255]);
    // bounding-box corners fall outside the ellipse -> still white
    expect(pixelAt(result, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(result, 9, 5)).toEqual([255, 255, 255, 255]);
  });

  it("applies the ellipse mask on the pixelate path too", () => {
    // Two-tone image (white top half, black bottom) so the block average differs from both.
    const pixels: Array<[number, number, number, number]> = [];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 10; x++) pixels.push(y < 3 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
    }
    const image = imageFromPixels(10, 6, pixels);
    const region = { x: 0, y: 0, width: 10, height: 6 };

    const result = redactRegion(image, region, { type: "pixelate" }, "ellipse");

    // corner outside the ellipse keeps its original pixel
    expect(pixelAt(result, 0, 0)).toEqual([255, 255, 255, 255]);
    // center inside the ellipse is pixelated away from its original black
    expect(pixelAt(result, 5, 3)).not.toEqual([0, 0, 0, 255]);
  });

  it("covers a stable hard-edged raster the live preview mirrors exactly (WYSIWYG regression)", () => {
    // Regression: the drag preview once drew a smooth analytic ellipse while the
    // commit filled this rasterized pixel set, so the hidden area was larger than
    // shown. The preview now renders through this same coverage — lock it so a
    // coverage change can never silently re-open the preview-vs-commit gap.
    const image = makeImage(6, 6, [255, 255, 255, 255]);
    const region = { x: 0, y: 0, width: 6, height: 6 };

    const result = redactRegion(image, region, { type: "solid", color: { r: 0, g: 0, b: 0, a: 255 } }, "ellipse");

    const coverage: string[] = [];
    for (let y = 0; y < 6; y++) {
      let row = "";
      for (let x = 0; x < 6; x++) row += pixelAt(result, x, y)[0] === 0 ? "#" : ".";
      coverage.push(row);
    }
    expect(coverage).toEqual([".####.", "######", "######", "######", "######", ".####."]);
  });
});

describe("redactRegion - trailing edge is pixel-exact", () => {
  // Region occupies columns/rows 1..5; the first pixel past it is index 6.
  const region = { x: 1, y: 1, width: 5, height: 5 };
  const black = { type: "solid" as const, color: { r: 0, g: 0, b: 0, a: 255 } };
  const shapes: Shape[] = ["rectangle", "ellipse"];

  it.each(shapes)("a %s redaction never paints at or beyond the trailing edge", (shape) => {
    const image = makeImage(8, 8, [255, 255, 255, 255]);
    const result = redactRegion(image, region, black, shape);

    // the first column and row past the region stay untouched (no stray sliver)
    for (let y = 0; y < 8; y++) expect(pixelAt(result, 6, y)).toEqual([255, 255, 255, 255]);
    for (let x = 0; x < 8; x++) expect(pixelAt(result, x, 6)).toEqual([255, 255, 255, 255]);
  });

  it("a rectangle fills exactly to its trailing corner and not one pixel further", () => {
    const image = makeImage(8, 8, [255, 255, 255, 255]);
    const result = redactRegion(image, region, black);

    expect(pixelAt(result, 5, 5)).toEqual([0, 0, 0, 255]); // last filled pixel (x+w-1, y+h-1)
    expect(pixelAt(result, 6, 5)).toEqual([255, 255, 255, 255]); // one past on x
    expect(pixelAt(result, 5, 6)).toEqual([255, 255, 255, 255]); // one past on y
  });
});

describe("redactRegion - bounds", () => {
  it("clamps a region that spills past the edge, changing only in-bounds pixels", () => {
    const image = makeImage(3, 3, [255, 255, 255, 255]);
    const result = redactRegion(
      image,
      { x: 1, y: 1, width: 5, height: 5 }, // extends well past the 3x3 image
      { type: "solid", color: { r: 0, g: 0, b: 0, a: 255 } },
    );

    // in-bounds part of the region -> black
    expect(pixelAt(result, 1, 1)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(result, 2, 2)).toEqual([0, 0, 0, 255]);

    // everything outside the region stays white (no row-wrap corruption)
    expect(pixelAt(result, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(result, 2, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(result, 0, 2)).toEqual([255, 255, 255, 255]);
  });

  it("leaves the image unchanged when the region is entirely outside it", () => {
    const image = makeImage(3, 3, [255, 255, 255, 255]);
    const result = redactRegion(image, { x: 10, y: 10, width: 4, height: 4 }, { type: "solid" });

    expect(Array.from(result.data)).toEqual(Array.from(image.data));
  });

  it("ignores negative origins, clamping to the top-left", () => {
    const image = makeImage(3, 3, [255, 255, 255, 255]);
    const result = redactRegion(
      image,
      { x: -2, y: -2, width: 4, height: 4 },
      { type: "solid", color: { r: 0, g: 0, b: 0, a: 255 } },
    );

    // region covers (0,0)..(1,1) after clamping
    expect(pixelAt(result, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(result, 1, 1)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(result, 2, 2)).toEqual([255, 255, 255, 255]);
  });
});

describe("redactRegion - purity", () => {
  it("does not mutate the original image", () => {
    const image = makeImage(3, 3, [255, 255, 255, 255]);
    const before = Array.from(image.data);

    const result = redactRegion(image, { x: 0, y: 0, width: 3, height: 3 }, { type: "solid" });

    expect(Array.from(image.data)).toEqual(before); // input untouched
    expect(result.data).not.toBe(image.data); // a new buffer was returned
  });
});
