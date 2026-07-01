import { redactMask, shapeCoverage, type PixelMask, type RasterImage, type Region } from "../core/redact";
import { composite, pickTopmost, removeRedaction, type Redaction } from "../core/scene";
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
  delete: HTMLButtonElement;
  undo: HTMLButtonElement;
  export: HTMLButtonElement;
  hint: HTMLElement;
}

/** How an outline is stroked — distinct treatments keep "drawing" and "selected" apart. */
interface StrokeStyle {
  color: string;
  dash: number[];
  width: number;
}

/** The live drag preview: thin green marching ants. */
const PREVIEW_STYLE: StrokeStyle = { color: "#25c97a", dash: [4, 3], width: 1 };
/** The selected redaction: a thicker white dashed box, clearly distinct from the preview. */
const SELECTION_STYLE: StrokeStyle = { color: "#ffffff", dash: [6, 4], width: 2 };

/**
 * Drives the redaction canvas. Redactions are kept as data — the pristine image
 * plus an ordered list of {region, covers, mode} — and the canvas is rendered by
 * compositing that list over the original. The original is held ONLY as the
 * compositing source: it is never drawn on its own once anything is redacted, and
 * export always outputs the composite, so hidden content can never leak out. The
 * Select tool picks an existing redaction (highlight only — it reveals nothing).
 */
export class RedactEditor {
  private readonly ctx: CanvasRenderingContext2D;
  private original: ImageData | null = null;
  private redactions: Redaction[] = [];
  // Snapshots of the redaction list before each change (draw or delete), so undo
  // can restore the exact prior state — including a deleted region at its z-order.
  private history: Redaction[][] = [];
  private selected: number | null = null;
  // The cached composite of `original` + `redactions`: the base for previews and
  // the only thing ever exported. Recomputed whenever the redaction list changes.
  private scene: ImageData | null = null;
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
    this.el.delete.addEventListener("click", () => this.deleteSelected());
    this.el.undo.addEventListener("click", () => this.undo());
    this.el.export.addEventListener("click", () => this.exportPng());
    this.el.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.el.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.el.canvas.addEventListener("pointerup", () => this.onPointerUp());
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  private async onFileChosen(): Promise<void> {
    const file = this.el.fileInput.files?.[0];
    if (!file) return;

    const bitmap = await createImageBitmap(file);
    this.el.canvas.width = bitmap.width;
    this.el.canvas.height = bitmap.height;
    this.ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    this.original = this.snapshot();
    this.redactions = [];
    this.history = [];
    this.setSelected(null);
    this.recompose();
    this.render();
    this.el.export.disabled = false;
    this.el.undo.disabled = true;
    this.el.hint.textContent = "Drag to hide anything. Pick Select to highlight a redaction, then Delete to remove it.";
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.scene) return;

    // Select tool: pick the redaction under the click instead of drawing a new one.
    if (this.tool() === "select") {
      this.setSelected(pickTopmost(this.redactions, this.toImageCoords(event)));
      this.render();
      return;
    }

    this.dragStart = this.toImageCoords(event);
    this.previewRegion = null;
    this.setSelected(null); // drawing a new redaction clears any highlight
    this.dragSettings = captureSettings(this.controlValues());
    this.brushPath = this.dragSettings.shape === "brush" ? [this.dragStart] : [];
    this.el.canvas.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragStart || !this.scene || !this.dragSettings) return;
    if (this.dragSettings.shape === "brush") {
      this.brushPath.push(this.toImageCoords(event));
    } else {
      this.previewRegion = this.regionFrom(this.dragStart, event);
    }
    const stroke = this.currentStroke();
    if (this.dragSettings.shape === "brush") {
      // Live-paint: render the brush's real redaction fill as it's painted, always
      // from the current scene — so committed pixels are untouched and the preview
      // is exactly what release will commit (same stroke through redactedImage).
      const preview = stroke ? this.redactedImage(this.scene, stroke.region, stroke.covers) : this.scene;
      this.ctx.putImageData(preview, 0, 0);
    } else {
      // Shapes: outline the exact pixels that will be redacted on release — see before fill.
      this.ctx.putImageData(this.scene, 0, 0);
      if (stroke) this.strokeEdges(maskEdges(stroke.region, stroke.covers), PREVIEW_STYLE);
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
      this.render(); // discard a stray click, repaint the scene
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

  /** Record a new redaction as data and re-render. The original pixels are never destroyed. */
  private applyStroke(region: Region, covers: PixelMask): void {
    if (!this.dragSettings) return;
    this.commit([...this.redactions, { region, covers, mode: this.dragSettings.mode }]);
  }

  /**
   * Delete the selected redaction, re-exposing what it hid. Only the selected
   * region is removed — every other redaction is untouched — and undo restores it.
   * A no-op when nothing is selected.
   */
  private deleteSelected(): void {
    if (this.selected === null) return;
    this.commit(removeRedaction(this.redactions, this.selected));
  }

  /**
   * Swap in a new redaction list, snapshotting the old one for undo. Every change
   * (draw or delete) goes through here, so undo reverses each of them the same way
   * and always restores the exact prior state. Clears the selection after the change.
   */
  private commit(next: Redaction[]): void {
    this.history.push(this.redactions);
    this.redactions = next;
    this.setSelected(null);
    this.recompose();
    this.render();
    this.el.undo.disabled = this.history.length === 0;
  }

  /** The selection rectangle for the current drag — one derivation shared by preview and commit. */
  private regionFrom(start: Point, event: PointerEvent): Region {
    return normalizeRect(start, this.toImageCoords(event));
  }

  /**
   * Render the brush's covered pixels (within `region`) over `source` into a fresh
   * image using the captured mode — the live brush preview. Goes through the same
   * mask-based core as a committed redaction, so the preview and the fill agree.
   */
  private redactedImage(source: ImageData, region: Region, covers: PixelMask): ImageData {
    const settings = this.dragSettings;
    if (!settings) throw new Error("No drag settings captured for this redaction");
    return this.toImageData(redactMask(source, region, settings.mode, covers));
  }

  /** Stroke a marching-ants outline of unit edges in the given style. */
  private strokeEdges(edges: Edge[], style: StrokeStyle): void {
    this.ctx.strokeStyle = style.color;
    this.ctx.lineWidth = style.width;
    this.ctx.setLineDash(style.dash);
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
    this.redactions = previous;
    this.setSelected(null);
    this.recompose();
    this.render();
    this.el.undo.disabled = this.history.length === 0;
  }

  private exportPng(): void {
    // Export the redacted composite only — never the original, never the selection
    // highlight. Paint the clean scene, capture it, then restore the on-screen highlight.
    this.paintScene();
    this.el.canvas.toBlob((blob) => {
      this.render();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "snap-clean.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  /** Recompute the cached composite from the original + current redaction list. */
  private recompose(): void {
    if (this.original) this.scene = this.toImageData(composite(this.original, this.redactions));
  }

  /** Paint the redacted composite — the base layer, with no selection highlight. */
  private paintScene(): void {
    if (this.scene) this.ctx.putImageData(this.scene, 0, 0);
  }

  /** Paint the composite, then outline the selected redaction (display only). */
  private render(): void {
    this.paintScene();
    if (this.selected === null) return;
    const target = this.redactions[this.selected];
    this.strokeEdges(maskEdges(target.region, target.covers), SELECTION_STYLE);
  }

  /** Set the selected redaction (or none) and keep the Delete button in sync. */
  private setSelected(index: number | null): void {
    this.selected = index;
    this.el.delete.disabled = index === null;
  }

  /** Delete / Backspace removes the selected redaction — only while one is selected. */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (this.selected === null) return;
    event.preventDefault(); // don't let Backspace navigate the page back
    this.deleteSelected();
  }

  private tool(): string {
    return this.selectedValue(this.el.shapeInputs) ?? "";
  }

  private selectedValue(inputs: NodeListOf<HTMLInputElement>): string | undefined {
    return Array.from(inputs).find((input) => input.checked)?.value;
  }

  /** Read the current control selections off the DOM — called once, at pointerdown. */
  private controlValues(): ControlValues {
    return {
      mode: this.selectedValue(this.el.modeInputs) ?? "",
      shape: this.tool(),
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

  /** Copy a core raster result into a canvas-ready ImageData buffer. */
  private toImageData(raster: RasterImage): ImageData {
    const image = this.ctx.createImageData(raster.width, raster.height);
    image.data.set(raster.data);
    return image;
  }
}
