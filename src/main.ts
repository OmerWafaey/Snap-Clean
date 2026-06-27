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
  solidColor: requireElement<HTMLInputElement>("solid-color"),
  undo: requireElement<HTMLButtonElement>("undo"),
  export: requireElement<HTMLButtonElement>("export"),
  hint: requireElement<HTMLElement>("hint"),
});
