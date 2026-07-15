export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * TypeScript's DOM lib types `Uint8Array` as generic over its backing
 * buffer (`ArrayBufferLike`, which includes `SharedArrayBuffer`), so
 * `Blob`/`crypto.subtle` APIs — typed to require a plain `ArrayBuffer` —
 * reject a bare `Uint8Array` at the type level even though every browser
 * accepts it fine at runtime. Every byte array in this app originates from
 * `file.arrayBuffer()`, `canvas.toBlob()`, or a fresh allocation — never a
 * SharedArrayBuffer — so this assertion is safe; it exists to satisfy the
 * type checker, not to change behavior.
 */
export function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function isImageFile(file: File): boolean {
  return (
    /^image\/(png|jpe?g)$/i.test(file.type) ||
    /\.(png|jpe?g)$/i.test(file.name)
  );
}

export function imageFormatOf(file: File): 'png' | 'jpg' {
  return /png/i.test(file.type) || /\.png$/i.test(file.name) ? 'png' : 'jpg';
}

/** Natural pixel size of an image blob. */
export function getImageSize(bytes: Uint8Array, format: 'png' | 'jpg'): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([asBufferSource(bytes)], { type: format === 'png' ? 'image/png' : 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Converts an image's pixel dimensions to PDF points assuming ~200dpi —
 * a reasonable stand-in for "this is meant to be a normal-sized page"
 * (scans, in particular, should land close to Letter/A4, not the ~23x29in
 * page a 96dpi screen-asset assumption would produce for a 2000px+ wide
 * scan). The full pixel data is still embedded either way — this only
 * changes what physical size the page *claims* to be. */
export const PX_TO_PT = 72 / 200;

export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf'): void {
  const blob = new Blob([asBufferSource(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function suggestOutputName(originalName: string, suffix: string): string {
  const base = originalName.replace(/\.pdf$/i, '');
  return `${base}${suffix}.pdf`;
}
