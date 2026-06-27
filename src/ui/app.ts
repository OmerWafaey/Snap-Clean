import { redactRegion, type RedactionMode, type Region } from "../core/redact";
import { normalizeRect, type Point } from "./geometry";
import { hexToRgba } from "./color";
import { blurBlockSize } from "./blur";

interface Elements {
  canvas: HTMLCanvasElement;
  fileInput: HTMLInputElement;
  modeInputs: NodeListOf<HTMLInputElement>;
  solidColor: HTMLInputElement;
  blurStrength: HTMLInputElement;
  undo: HTMLButtonElement;
  export: HTMLButtonElement;
  hint: HTMLElement;
}

/**
 * Drives the redaction canvas: load an image, drag a rectangle to select a
 * region, redact it immediately and permanently, undo, and export. All pixel
 * work goes through the pure `redactRegion` core.
 */
export class RedactEditor {
  private readonly ctx: CanvasRenderingContext2D;
  private committed: ImageData | null = null;
  private readonly history: ImageData[] = [];
  private dragStart: Point | null = null;

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
    this.el.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
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
    this.el.canvas.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragStart || !this.committed) return;
    const selection = normalizeRect(this.dragStart, this.toImageCoords(event));
    this.ctx.putImageData(this.committed, 0, 0);
    this.drawSelection(selection);
  }

  private onPointerUp(event: PointerEvent): void {
    const start = this.dragStart;
    if (!start) return;
    this.dragStart = null;

    const region = normalizeRect(start, this.toImageCoords(event));
    if (region.width < 1 || region.height < 1) {
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
    const result = redactRegion(source, region, this.currentMode());
    const next = this.ctx.createImageData(result.width, result.height);
    next.data.set(result.data);
    this.committed = next;
    this.restore();
    this.el.undo.disabled = false;
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

  private currentMode(): RedactionMode {
    const checked = Array.from(this.el.modeInputs).find((input) => input.checked);
    // Strength feeds the blur block size only; solid stays fully opaque.
    return checked?.value === "pixelate"
      ? { type: "pixelate", blockSize: blurBlockSize(Number(this.el.blurStrength.value)) }
      : { type: "solid", color: hexToRgba(this.el.solidColor.value) };
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

  private drawSelection(region: Region): void {
    this.ctx.strokeStyle = "#25c97a";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.strokeRect(region.x, region.y, region.width, region.height);
    this.ctx.setLineDash([]);
  }

  private snapshot(): ImageData {
    return this.ctx.getImageData(0, 0, this.el.canvas.width, this.el.canvas.height);
  }

  private restore(): void {
    if (this.committed) this.ctx.putImageData(this.committed, 0, 0);
  }
}
