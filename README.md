# PDF Pro

A free, installable PDF editor PWA — view, annotate, fill & sign, organize,
watermark, and password-protect PDFs entirely in your browser. No uploads,
no accounts, no subscription: every file is processed on-device with
[pdf.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/),
and nothing ever leaves your machine.

## Features

- **View** — fast, accurate PDF rendering (pdf.js), continuous scroll, zoom, thumbnails, in-document **search** with jump-to-match highlighting
- **Comment & Annotate** — highlight, freehand draw, text boxes, sticky notes; signatures/text can be freely rotated in place
- **Fill & Sign** — fills real AcroForm fields (text, checkbox, radio, dropdown); draw, type, or upload a signature; saved signatures reusable across documents; date stamps, checkmarks, X marks, circles, lines
- **Scan Document** — use your phone or laptop camera to capture pages, drag corners for perspective correction (straightens an angled photo like a real scanner), color/grayscale/B&W filters, multi-page sessions combined into one PDF
- **Organize** — drag-to-reorder pages, rotate, delete, merge multiple files, extract/split pages
- **Page Tools** — text watermarks, page numbering, page **crop** (margin trim via CropBox), **export pages as images** (PNG/JPEG, zipped), image-to-PDF
- **Compress** — shrink scan/photo-heavy PDFs by re-encoding pages at a chosen quality level
- **Print** — opens the fully-rendered document (with all edits baked in) in a new tab for the browser's native print dialog
- **Protect** — real AES-256 password encryption (PDF 2.0 standard security handler), implemented on native Web Crypto with no third-party crypto dependency, and self-verified before every download
- **Installable PWA** — works fully offline once installed, with a mobile-first UI (bottom tab navigation, touch-sized handles, camera scanner) on desktop (Windows/Mac/Linux) and Android
- **Real Android app** — packageable as an installable APK/AAB via a Trusted Web Activity — see [ANDROID.md](ANDROID.md)

## Tech stack

React + TypeScript + Vite, Tailwind CSS v4, Zustand, pdf.js (`pdfjs-dist`),
`pdf-lib`, `signature_pad`, IndexedDB (via `idb`) for recent files and saved
signatures, `vite-plugin-pwa` for the service worker/manifest.

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build      # production build to dist/
npm run preview    # serve the production build locally
npm run lint
```

## Deploying to GitHub Pages (for installing on your phone)

Installing a PWA on Android requires it to be served over HTTPS from a real
origin — `localhost` only works for desktop testing. This repo ships a
GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and
deploys to GitHub Pages automatically on every push to `main`.

1. Create a new GitHub repository and push this project to it:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. In the repo on GitHub: **Settings → Pages → Source → GitHub Actions**.
3. Push again (or re-run the workflow from the Actions tab) — it will build
   and deploy to `https://<your-username>.github.io/<repo-name>/`.
4. Open that URL on your Android phone in Chrome → menu → **Install app**
   (or you'll see an automatic "Add to Home screen" prompt). On
   Windows/desktop Chrome or Edge, look for the install icon in the address
   bar.

The workflow reads the repository name automatically to set the app's base
path, so no manual configuration is needed regardless of what you name the
repo.

## Notes & limitations

- OCR and redaction are not implemented in this version.
- "Protect" encrypts page content streams (everything needed to view or
  extract the document) with AES-256; some low-sensitivity metadata strings
  are left as plaintext per the PDF spec's `/StrF Identity` mechanism. This
  is not a substitute for legal-grade document security on extremely
  sensitive material.
- Text rendering in exported PDFs uses the standard 14 PDF fonts
  (Helvetica); very large custom-font or CJK-heavy documents may see font
  substitution in Annotate/Fill & Sign-added text.
