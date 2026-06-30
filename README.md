<p align="center">
  <img src="Snap%20Clean.png" alt="Snap Clean" width="480" />
</p>

<h1 align="center">Snap Clean</h1>

<p align="center"><strong>Blur. Redact. Share with confidence.</strong> 🛡️</p>

---

Ever wanted to share a screenshot but needed to hide a name, a face, or an account
number first? **Snap Clean** makes that effortless. Open an image, drag over whatever
you want to hide, and export a clean PNG — all in your browser, in seconds. ✨

Best of all: your images **never leave your device**. No uploads, no servers, no
worries. 🔒

## ✨ What it does

- 🖤 **Solid redaction** — cover anything sensitive with an opaque, fully-hiding fill in any color.
- 🌫️ **Blur / pixelate** — soften regions with adjustable blur strength.
- ⬛ **Flexible shapes** — rectangle, circle, or a free-hand brush with adjustable size.
- 👀 **Live preview** — watch the outline as you drag; it fills in when you release.
- ↩️ **Undo** — changed your mind? Step right back.
- 💾 **Export PNG** — download your cleaned-up image with one click.

## 🚀 Getting started

You'll need [Node.js](https://nodejs.org/) installed.

```bash
# grab the dependencies
npm install

# fire up the dev server
npm run dev

# build for production
npm run build

# preview the production build
npm run preview
```

Then open the local URL Vite prints (usually `http://localhost:5173`) and you're good to go!

## 🎯 How to use it

1. Click **Open image** and pick a photo or screenshot.
2. Choose a **mode** (Solid or Blur) and a **shape** (Rectangle, Circle, or Brush).
3. Drag across anything you'd like to hide. 🖱️
4. Hit **Undo** if you need a do-over, then **Export PNG** to save the result.

## 🛠️ Development

```bash
# run the tests
npm test

# watch mode
npm run test:watch

# type-check only
npm run typecheck
```

Built with ❤️ using [TypeScript](https://www.typescriptlang.org/),
[Vite](https://vitejs.dev/), and [Vitest](https://vitest.dev/).

### 📁 Project structure

```
src/
  core/    Pure, canvas-free redaction logic (redact, ellipse) + tests
  ui/      Browser glue: blur, brush, color, geometry, outline, settings + tests
  main.ts  Entry point
  style.css
index.html
```

The core stays pure and testable: it works on raw RGBA pixel data (structurally
compatible with the browser's `ImageData`), so the redaction logic can be unit-tested
without ever touching a real canvas.

## 🔒 Privacy first

Snap Clean runs **entirely in your browser**. Your images are processed locally and
never leave your device. Share with confidence. 💙
