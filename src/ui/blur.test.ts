import { describe, it, expect } from "vitest";
import { blurBlockSize } from "./blur";

describe("blurBlockSize", () => {
  const cases: Array<{ scenario: string; strength: number; expected: number }> = [
    { scenario: "the floor — never 0, which would hang the pixelate loop", strength: 0, expected: 4 },
    { scenario: "a proportional sample between floor and max", strength: 25, expected: 6 },
    { scenario: "the default — identical to the baseline blur", strength: 50, expected: 12 },
    { scenario: "max strength — the heaviest blur", strength: 100, expected: 24 },
  ];

  it.each(cases)("maps $strength% strength to $expected ($scenario)", ({ strength, expected }) => {
    expect(blurBlockSize(strength)).toBe(expected);
  });

  it("never blurs less as strength increases", () => {
    for (let strength = 1; strength <= 100; strength++) {
      expect(blurBlockSize(strength)).toBeGreaterThanOrEqual(blurBlockSize(strength - 1));
    }
  });
});
