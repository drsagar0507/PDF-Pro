# Publishing PDF Pro as an Android app

PDF Pro ships as a PWA, which means the same deployed site can become a real,
installable Android app — an APK/AAB you can sideload or publish to the Play
Store — without a separate codebase. This uses a **Trusted Web Activity
(TWA)**: a thin native wrapper that opens your PWA in a full-screen, chrome-
less Chrome instance. Google's own [PWABuilder](https://www.pwabuilder.com)
does the packaging for you — no Android Studio, no Java, no local SDK.

## Prerequisites

- The app must already be deployed and reachable over HTTPS (see
  [README.md](README.md) for the GitHub Pages deploy steps) —
  `https://<your-username>.github.io/<repo-name>/`.

## 1. Generate the Android package

1. Go to **[pwabuilder.com](https://www.pwabuilder.com)** and enter your
   deployed URL. Click **Start**.
2. PWABuilder analyzes the manifest and service worker. It should score
   well — icons, `display: standalone`, offline support, and shortcuts are
   already configured in this project (`vite.config.ts`'s `VitePWA`
   manifest block).
3. Click **Package for Stores** → **Android**.
4. Choose a **Package ID** (reverse-domain style, e.g.
   `io.github.drsagar0507.pdfpro`) — this is permanent, pick carefully.
5. Under signing, either:
   - **Generate a new signing key** (simplest — PWABuilder creates and
     hands you a keystore), or
   - Upload your own keystore if you have one.
6. Download the generated package. It includes:
   - A signed `.aab` (for Play Store) and/or `.apk` (for direct install)
   - The keystore file (`signing.keystore` or similar) — **back this up
     somewhere safe**. You need the exact same key to publish any future
     update; losing it means you can never update that Play Store listing
     again.
   - An `assetlinks.json` file.

## 2. Wire up Digital Asset Links (removes the browser address bar)

Without this step the app still installs and runs, but Android shows it
inside a Chrome Custom Tab (with a thin browser toolbar) instead of a fully
trusted, chrome-less app window.

1. Open the `assetlinks.json` PWABuilder gave you.
2. Replace the placeholder at
   [public/.well-known/assetlinks.json](public/.well-known/assetlinks.json)
   in this repo with its contents (it needs your real `package_name` and
   `sha256_cert_fingerprints`).
3. Commit and push to `main` — the GitHub Actions workflow redeploys
   automatically, publishing the file at
   `https://<your-username>.github.io/<repo-name>/.well-known/assetlinks.json`.
4. Verify it's live: open that URL directly in a browser — you should see
   your real JSON, not the placeholder.

## 3. Install it

- **Sideload the APK directly:** copy the `.apk` to your phone (or send it
  to yourself), open it, and allow "install unknown apps" for that source
  when prompted.
- **Publish to the Play Store:** upload the `.aab` to the
  [Google Play Console](https://play.google.com/console) (requires a
  one-time $25 developer account fee) as a new app release.

## Updating the app later

Because it's a TWA, most updates need **no repackaging at all** — push
changes to `main`, the site redeploys, and the installed app picks up the
new content the next time it's opened (same as the regular PWA update
flow). You only need to regenerate the Android package in PWABuilder if you
change the manifest itself (icons, name, `display` mode) in a way that
affects the native shell.
