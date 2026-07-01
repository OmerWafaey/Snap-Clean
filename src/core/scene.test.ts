import { describe, it, expect } from "vitest";
import { composite, pickTopmost, removeRedaction, type Redaction } from "./scene";
import { shapeCoverage, type RasterImage } from "./redact";

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

/** A solid-black rectangle redaction over the given region — the common test fixture. */
function blackRect(region: { x: number; y: number; width: number; height: number }): Redaction {
  return { region, covers: shapeCoverage("rectangle", region), mode: { type: "solid", color: { r: 0, g: 0, b: 0, a: 255 } } };
}

describe("composite - empty scene", () => {
  it("returns a fresh copy identical to the original (nothing redacted yet)", () => {
    const original = makeImage(4, 4, [255, 255, 255, 255]);

    const result = composite(original, []);

    expect(Array.from(result.data)).toEqual(Array.from(original.data)); // identical pixels
    expect(result.data).not.toBe(original.data); // but a new buffer — the original is never handed out
  });

  it("hides a single redaction's covered pixels and leaves the rest untouched", () => {
    const original = makeImage(4, 4, [255, 255, 255, 255]);

    const result = composite(original, [blackRect({ x: 1, y: 1, width: 2, height: 2 })]);

    expect(pixelAt(result, 1, 1)).toEqual([0, 0, 0, 255]); // inside -> hidden
    expect(pixelAt(result, 2, 2)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(result, 0, 0)).toEqual([255, 255, 255, 255]); // outside -> untouched
    expect(pixelAt(result, 3, 3)).toEqual([255, 255, 255, 255]);
  });

  it("paints later redactions over earlier ones and hides every covered pixel of both", () => {
    const original = makeImage(6, 4, [255, 255, 255, 255]);
    const red = { type: "solid" as const, color: { r: 200, g: 0, b: 0, a: 255 } };
    const blue = { type: "solid" as const, color: { r: 0, g: 0, b: 200, a: 255 } };
    const left = { x: 0, y: 0, width: 4, height: 4 };
    const right = { x: 2, y: 0, width: 4, height: 4 }; // overlaps columns 2..3 with `left`

    const result = composite(original, [
      { region: left, covers: shapeCoverage("rectangle", left), mode: red },
      { region: right, covers: shapeCoverage("rectangle", right), mode: blue }, // on top
    ]);

    // Non-overlapping parts keep their own redaction's color.
    expect(pixelAt(result, 0, 0)).toEqual([200, 0, 0, 255]); // only left
    expect(pixelAt(result, 5, 0)).toEqual([0, 0, 200, 255]); // only right
    // The overlap shows the later (top) redaction, never the original underneath.
    expect(pixelAt(result, 3, 0)).toEqual([0, 0, 200, 255]);
    // Privacy: no covered pixel of either redaction is left as the original white.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) expect(pixelAt(result, x, y)).not.toEqual([255, 255, 255, 255]);
    }
  });
});

describe("pickTopmost - selecting an existing redaction", () => {
  const single = [blackRect({ x: 1, y: 1, width: 3, height: 3 })];

  it.each([
    { name: "a point on the redaction's covered pixels selects it", point: { x: 2, y: 2 }, expected: 0 },
    { name: "a point on empty space selects nothing (clicking away deselects)", point: { x: 8, y: 8 }, expected: null },
  ])("$name", ({ point, expected }) => {
    expect(pickTopmost(single, point)).toBe(expected);
  });

  it("selects the topmost (last-painted) redaction where two overlap", () => {
    const scene = [
      blackRect({ x: 0, y: 0, width: 4, height: 4 }), // index 0, underneath
      blackRect({ x: 2, y: 2, width: 4, height: 4 }), // index 1, on top
    ];

    // (3,3) is covered by both; the one painted last is what the user sees and picks.
    expect(pickTopmost(scene, { x: 3, y: 3 })).toBe(1);
    // (0,0) is covered only by the lower one.
    expect(pickTopmost(scene, { x: 0, y: 0 })).toBe(0);
  });

  it("ignores an ellipse's empty bounding-box corner (hit-tests coverage, not the box)", () => {
    const region = { x: 0, y: 0, width: 10, height: 6 };
    const ellipse: Redaction = {
      region,
      covers: shapeCoverage("ellipse", region),
      mode: { type: "solid", color: { r: 0, g: 0, b: 0, a: 255 } },
    };

    expect(pickTopmost([ellipse], { x: 5, y: 3 })).toBe(0); // center is hidden -> selectable
    expect(pickTopmost([ellipse], { x: 0, y: 0 })).toBeNull(); // corner shows the image -> nothing to select
  });

  it("falls through an upper ellipse's empty corner to a redaction actually under the point", () => {
    const region = { x: 0, y: 0, width: 10, height: 6 };
    const scene = [
      blackRect({ x: 0, y: 0, width: 3, height: 3 }), // index 0, sits under the ellipse's corner
      { region, covers: shapeCoverage("ellipse", region), mode: { type: "solid" as const } }, // index 1, on top
    ];

    // (0,0) is outside the ellipse's coverage but inside the lower rectangle -> picks the rectangle.
    expect(pickTopmost(scene, { x: 0, y: 0 })).toBe(0);
  });
});

describe("removeRedaction - deleting a selected region", () => {
  it("returns a new list without the chosen redaction, keeping the others in order", () => {
    const a = blackRect({ x: 0, y: 0, width: 2, height: 2 });
    const b = blackRect({ x: 2, y: 2, width: 2, height: 2 });
    const c = blackRect({ x: 4, y: 4, width: 2, height: 2 });
    const scene = [a, b, c];

    const result = removeRedaction(scene, 1); // delete the middle one

    expect(result).toEqual([a, c]); // b gone, a and c kept in their original order
    expect(scene).toEqual([a, b, c]); // input list is never mutated
  });

  it("re-exposes the deleted region's pixels while the others stay fully hidden", () => {
    const original = makeImage(6, 4, [255, 255, 255, 255]); // white
    const left = blackRect({ x: 0, y: 0, width: 2, height: 4 }); // hides column 0..1
    const right = blackRect({ x: 4, y: 0, width: 2, height: 4 }); // hides column 4..5
    const scene = [left, right];

    // Sanity: with both present, both areas are hidden.
    const before = composite(original, scene);
    expect(pixelAt(before, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(before, 5, 0)).toEqual([0, 0, 0, 255]);

    // Delete the left redaction -> its pixels come back, the right stays hidden.
    const after = composite(original, removeRedaction(scene, 0));
    expect(pixelAt(after, 0, 0)).toEqual([255, 255, 255, 255]); // re-exposed (intended)
    expect(pixelAt(after, 1, 3)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(after, 5, 0)).toEqual([0, 0, 0, 255]); // the other redaction is untouched
  });
});
