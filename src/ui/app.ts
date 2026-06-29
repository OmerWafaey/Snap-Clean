import { redactMask, shapeCoverage, type PixelMask, type Region } from "../core/redact";
import { normalizeRect, type Point } from "./geometry";
import { maskEdges, type Edge } from "./outline";
import { brushBounds, brushCoverage } from "./brush";
import { captureSettings, type ControlValues, type DragSettings } from "./settings";

interface Elements {
  canvas: HTMLCanvasElement;
  fileInput: HTMLInputElement;
  modeInputs: NodeListOf<HTMLInputElement>;
  shapeInputs: NodeListOf<HTMLInputElement>;
  solidColor: HTMLInputElement;
  blurStrength: HTMLInputElement;
  brushSize: HTMLInputElement;
  undo: HTMLButtonElement;
  export: HTMLButtonElement;
  hint: HTMLElement;
}

/**
 * Drives the redaction canvas: load an image, drag to select an area, redact it
 * immediately and permanently, undo, and export. The drag preview and the commit
 * both go through the pure `redactRegion` core, so what you see is what gets hidden.
 */
export class RedactEditor {
  private readonly ctx: CanvasRenderingContext2D;
  private committed: ImageData | null = null;
  private readonly history: ImageData[] = [];
  private dragStart: Point | null = null;
  private previewRegion: Region | null = null;
  private brushPath: Point[] = [];
  // Mode + tool are locked in when the drag begins, so changing a control
  // mid-drag never alters what the in-progress selection will redact.
  private dragSettings: DragSettings | null = null;

  constructor(private readonly el: Elements) {
    const ctx = el.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is not available in this browser");
    this.ctx = ctx;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.el.fileInput.addEventListener("change", () => this.onFileChosen());
    this.el.undo.addEventListener("click", () => this.undo());
    this.el.export.addEventListener("click", () => this.exportPng());
    this.el.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.el.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.el.canvas.addEventListener("pointerup", () => this.onPointerUp());
  }

  private async onFileChosen(): Promise<void> {
    const file = this.el.fileInput.files?.[0];
    if (!file) return;

    const bitmap = await createImageBitmap(file);
    this.el.canvas.width = bitmap.width;
    this.el.canvas.height = bitmap.height;
    this.ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    this.history.length = 0;
    this.committed = this.snapshot();
    this.el.export.disabled = false;
    this.el.undo.disabled = true;
    this.el.hint.textContent = "Drag across anything you want to hide. Switch between Solid and Blur as needed.";
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.committed) return;
    this.dragStart = this.toImageCoords(event);
    this.previewRegion = null;
    this.dragSettings = captureSettings(this.controlValues());
    this.brushPath = this.dragSettings.shape === "brush" ? [this.dragStart] : [];
    this.el.canvas.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragStart || !this.committed || !this.dragSettings) return;
    if (this.dragSettings.shape === "brush") {
      this.brushPath.push(this.toImageCoords(event));
    } else {
      this.previewRegion = this.regionFrom(this.dragStart, event);
    }
    const stroke = this.currentStroke();
    if (this.dragSettings.shape === "brush") {
      // Live-paint: render the brush's real redaction fill as it's painted, always
      // from the committed image — so committed pixels are untouched and the preview
      // is exactly what release will commit (same stroke through redactedImage).
      const preview = stroke ? this.redactedImage(this.committed, stroke.region, stroke.covers) : this.committed;
      this.ctx.putImageData(preview, 0, 0);
    } else {
      // Shapes: outline the exact pixels that will be redacted on release — see before fill.
      this.ctx.putImageData(this.committed, 0, 0);
      if (stroke) this.drawOutline(maskEdges(stroke.region, stroke.covers));
    }
  }

  private onPointerUp(): void {
    if (!this.dragStart) return;
    this.dragStart = null;

    // Commit the exact coverage the preview last showed — never recompute from the
    // release point, which can land a pixel past what was displayed.
    const stroke = this.currentStroke();
    this.previewRegion = null;
    this.brushPath = [];
    if (!stroke) {
      this.restore(); // discard a stray click, repaint the committed image
      return;
    }
    this.applyStroke(stroke.region, stroke.covers);
  }

  /**
   * The region + coverage for the current drag, by tool. Preview and commit both
   * read this one derivation, so the outline marks exactly what the fill hides.
   * Returns null when there is nothing to redact yet (e.g. a stray click).
   */
  private currentStroke(): { region: Region; covers: PixelMask } | null {
    const settings = this.dragSettings;
    if (!settings) return null;

    if (settings.shape === "brush") {
      if (this.brushPath.length === 0) return null;
      return {
        region: brushBounds(this.brushPath, settings.radius),
        covers: brushCoverage(this.brushPath, settings.radius),
      };
    }

    const region = this.previewRegion;
    if (!region || region.width < 1 || region.height < 1) return null;
    return { region, covers: shapeCoverage(settings.shape, region) };
  }

  /** Redact the covered pixels permanently — committed pixels are never edited again. */
  private applyStroke(region: Region, covers: PixelMask): void {
    const source = this.committed;
    if (!source) return;

    this.history.push(source);
    this.committed = this.redactedImage(source, region, covers);
    this.restore();
    this.el.undo.disabled = false;
  }

  /** The selection rectangle for the current drag — one derivation shared by preview and commit. */
  private regionFrom(start: Point, event: PointerEvent): Region {
    return normalizeRect(start, this.toImageCoords(event));
  }

  /**
   * Redact the pixels selected by `covers` (within `region`) into a fresh image
   * using the captured mode. Every tool — shapes and the brush — fills through
   * this one mask-based core, so the outline and the fill can never diverge.
   */
  private redactedImage(source: ImageData, region: Region, covers: PixelMask): ImageData {
    const settings = this.dragSettings;
    if (!settings) throw new Error("No drag settings captured for this redaction");
    const result = redactMask(source, region, settings.mode, covers);
    const image = this.ctx.createImageData(result.width, result.height);
    image.data.set(result.data);
    return image;
  }

  /** Stroke the marching-ants outline of the exact pixels that will be redacted. */
  private drawOutline(edges: Edge[]): void {
    this.ctx.strokeStyle = "#25c97a";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 3]);
    this.ctx.beginPath();
    for (const edge of edges) {
      this.ctx.moveTo(edge.x1, edge.y1);
      this.ctx.lineTo(edge.x2, edge.y2);
    }
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  private undo(): void {
    const previous = this.history.pop();
    if (!previous) return;
    this.committed = previous;
    this.restore();
    this.el.undo.disabled = this.history.length === 0;
  }

  private exportPng(): void {
    this.el.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "snap-clean.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  private selectedValue(inputs: NodeListOf<HTMLInputElement>): string | undefined {
    return Array.from(inputs).find((input) => input.checked)?.value;
  }

  /** Read the current control selections off the DOM — called once, at pointerdown. */
  private controlValues(): ControlValues {
    return {
      mode: this.selectedValue(this.el.modeInputs) ?? "",
      shape: this.selectedValue(this.el.shapeInputs) ?? "",
      color: this.el.solidColor.value,
      strength: Number(this.el.blurStrength.value),
      size: Number(this.el.brushSize.value),
    };
  }

  private toImageCoords(event: PointerEvent): Point {
    const rect = this.el.canvas.getBoundingClientRect();
    const scaleX = this.el.canvas.width / rect.width;
    const scaleY = this.el.canvas.height / rect.height;
    return {
      x: Math.round((event.clientX - rect.left) * scaleX),
      y: Math.round((event.clientY - rect.top) * scaleY),
    };
  }

  private snapshot(): ImageData {
    return this.ctx.getImageData(0, 0, this.el.canvas.width, this.el.canvas.height);
  }

  private restore(): void {
    if (this.committed) this.ctx.putImageData(this.committed, 0, 0);
  }
}
