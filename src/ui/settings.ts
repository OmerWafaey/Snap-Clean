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
}

/** The raw control values read off the DOM once, when the drag starts. */
export interface ControlValues {
  mode: string;
  shape: string;
  color: string;
  strength: number;
}

export function captureSettings(controls: ControlValues): DragSettings {
  return { mode: toMode(controls), shape: toShape(controls.shape) };
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
