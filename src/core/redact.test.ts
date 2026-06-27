import { describe, it, expect } from "vitest";
import { redactRegion, type RasterImage } from "./redact";

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
