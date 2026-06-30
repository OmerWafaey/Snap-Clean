# Snap Clean

**Blur. Redact. Share with confidence.**

Snap Clean is a fast, browser-based image redaction tool. Open an image, drag over
anything you want to hide — faces, names, account numbers — and export a clean PNG.
Everything happens locally in your browser; your images are never uploaded anywhere.

## Features

- **Solid redaction** — cover sensitive areas with an opaque, fully-hiding fill in any color.
- **Blur / pixelate** — obscure regions with adjustable blur strength.
- **Shapes** — rectangle, circle, or free-hand brush with adjustable brush size.
- **Live preview** — see the redaction outline as you drag; it fills on release.
- **Undo** — step back through redactions.
- **Export PNG** — download the cleaned image.

## Getting started

Requires [Node.js](https://nodejs.org/).

```bash
# install dependencies
npm install

# start the dev server
npm run dev

# build for production
npm run build

# preview the production build
npm run preview
```

Then open the local URL printed by Vite (typically `http://localhost:5173`).

## Usage

1. Click **Open image** and choose a photo or screenshot.
2. Pick a **mode** (Solid or Blur) and a **shape** (Rectangle, Circle, or Brush).
3. Drag across anything you want to hide.
4. Use **Undo** to revert, then click **Export PNG** to save the cleaned image.

## Development

```bash
# run the test suite
npm test

# watch mode
npm run test:watch

# type-check only
npm run typecheck
```

The project is built with [TypeScript](https://www.typescriptlang.org/),
[Vite](https://vitejs.dev/), and [Vitest](https://vitest.dev/).

### Project structure

```
src/
  core/    Pure, canvas-free redaction logic (redact, ellipse) + tests
  ui/      Browser glue: blur, brush, color, geometry, outline, settings + tests
  main.ts  Entry point
  style.css
index.html
```

The core stays pure and testable: it operates on raw RGBA pixel data (structurally
compatible with the browser's `ImageData`), so redaction logic can be unit-tested
without a real canvas.

## Privacy

Snap Clean runs entirely in your browser. Images are processed locally and never
leave your device.
