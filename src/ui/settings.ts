import { blurBlockSize } from "./blur";
import { hexToRgba } from "./color";
import type { RedactionMode, Shape } from "../core/redact";

/** A redaction tool: a fixed shape, or the free-hand brush. */
export type Tool = Shape | "brush";

/**
 * The mode + tool captured at the moment a drag begins. The whole drag — preview
 * and the committed redaction — reads from this snapshot, so flipping a radio
 * mid-drag never changes what the in-progress selection will hide.
 */
export interface DragSettings {
  mode: RedactionMode;
  shape: Tool;
  radius: number;
}

/** The raw control values read off the DOM once, when the drag starts. */
export interface ControlValues {
  mode: string;
  shape: string;
  color: string;
  strength: number;
  size: number;
}

export function captureSettings(controls: ControlValues): DragSettings {
  return { mode: toMode(controls), shape: toShape(controls.shape), radius: brushRadius(controls.size) };
}

/**
 * The brush radius in image pixels for a drag. Size only grows the covered area —
 * never the redaction strength — so a thin and a thick stroke hide equally fully.
 * A blank or out-of-range value falls back to the default rather than producing a
 * thinner-than-allowed (or absurdly large) stroke; NaN fails both bounds checks.
 */
const MIN_RADIUS = 2;
const MAX_RADIUS = 48;
const DEFAULT_RADIUS = 12;

export function brushRadius(size: number): number {
  return size >= MIN_RADIUS && size <= MAX_RADIUS ? size : DEFAULT_RADIUS;
}

function toMode(controls: ControlValues): RedactionMode {
  // Strength feeds the blur block size only; solid stays fully opaque.
  return controls.mode === "pixelate"
    ? { type: "pixelate", blockSize: blurBlockSize(controls.strength) }
    : { type: "solid", color: hexToRgba(controls.color) };
}

function toShape(shape: string): Tool {
  if (shape === "ellipse") return "ellipse";
  if (shape === "brush") return "brush";
  return "rectangle";
}
