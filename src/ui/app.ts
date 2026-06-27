import { redactRegion, type RedactionMode, type Region, type Shape } from "../core/redact";
import { normalizeRect, type Point } from "./geometry";
import { hexToRgba } from "./color";
import { blurBlockSize } from "./blur";

interface Elements {
  canvas: HTMLCanvasElement;
  fileInput: HTMLInputElement;
  modeInputs: NodeListOf<HTMLInputElement>;
  shapeInputs: NodeListOf<HTMLInputElement>;
  solidColor: HTMLInputElement;
  blurStrength: HTMLInputElement;
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
    this.el.canvas.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragStart || !this.committed) return;
    this.previewRegion = this.regionFrom(this.dragStart, event);
    // Preview the real redaction, so what you see is exactly what will be hidden.
    this.ctx.putImageData(this.redactedImage(this.committed, this.previewRegion), 0, 0);
  }

  private onPointerUp(): void {
    if (!this.dragStart) return;
    this.dragStart = null;

    // Commit the exact region the preview last showed — never recompute from the
    // release point, which can land a pixel past what was displayed.
    const region = this.previewRegion;
    this.previewRegion = null;
    if (!region || region.width < 1 || region.height < 1) {
      this.restore(); // discard a stray click, repaint the committed image
      return;
    }
    this.applyRegion(region);
  }

  /** Redact the region permanently — committed regions are never edited again. */
  private applyRegion(region: Region): void {
    const source = this.committed;
    if (!source) return;

    this.history.push(source);
    this.committed = this.redactedImage(source, region);
    this.restore();
    this.el.undo.disabled = false;
  }

  /** The selection rectangle for the current drag — one derivation shared by preview and commit. */
  private regionFrom(start: Point, event: PointerEvent): Region {
    return normalizeRect(start, this.toImageCoords(event));
  }

  /**
   * Redact `region` into a fresh image using the current mode and shape. This is
   * the single place pixels get hidden, so the drag preview and the committed
   * result are produced identically — what you see is exactly what gets redacted.
   */
  private redactedImage(source: ImageData, region: Region): ImageData {
    const result = redactRegion(source, region, this.currentMode(), this.currentShape());
    const image = this.ctx.createImageData(result.width, result.height);
    image.data.set(result.data);
    return image;
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

  private currentMode(): RedactionMode {
    // Strength feeds the blur block size only; solid stays fully opaque.
    return this.selectedValue(this.el.modeInputs) === "pixelate"
      ? { type: "pixelate", blockSize: blurBlockSize(Number(this.el.blurStrength.value)) }
      : { type: "solid", color: hexToRgba(this.el.solidColor.value) };
  }

  private currentShape(): Shape {
    return this.selectedValue(this.el.shapeInputs) === "ellipse" ? "ellipse" : "rectangle";
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
