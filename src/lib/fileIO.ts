export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
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
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: format === 'png' ? 'image/png' : 'image/jpeg' });
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

/** Assume images are ~96dpi screen assets and convert to PDF points (72/in)
 * so a typical photo lands at a sane physical page size. */
export const PX_TO_PT = 72 / 96;

export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf'): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
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
