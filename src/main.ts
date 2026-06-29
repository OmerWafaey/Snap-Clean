import { RedactEditor } from "./ui/app";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: #${id}`);
  return element as T;
}

new RedactEditor({
  canvas: requireElement<HTMLCanvasElement>("canvas"),
  fileInput: requireElement<HTMLInputElement>("file-input"),
  modeInputs: document.querySelectorAll<HTMLInputElement>('input[name="mode"]'),
  shapeInputs: document.querySelectorAll<HTMLInputElement>('input[name="shape"]'),
  solidColor: requireElement<HTMLInputElement>("solid-color"),
  blurStrength: requireElement<HTMLInputElement>("blur-strength"),
  brushSize: requireElement<HTMLInputElement>("brush-size"),
  undo: requireElement<HTMLButtonElement>("undo"),
  export: requireElement<HTMLButtonElement>("export"),
  hint: requireElement<HTMLElement>("hint"),
});
