function paint(source: CanvasImageSource, width: number, height: number): string {
  const max = 1600;
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn’t read that photo.");
  ctx.drawImage(source, 0, 0, w, h);
  let quality = 0.82;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length > 1_400_000 && quality > 0.5) {
    quality = Math.round((quality - 0.08) * 100) / 100;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  return url;
}

export function jpegDataUrl(source: CanvasImageSource, width: number, height: number): string {
  return paint(source, width, height);
}

export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose a photo."));
      return;
    }
    const fromElement = () => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          resolve(paint(img, img.width, img.height));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Couldn’t read that photo."));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Couldn’t read that photo. Try a JPEG or PNG."));
      };
      img.src = objectUrl;
    };
    if (typeof createImageBitmap !== "function") {
      fromElement();
      return;
    }
    createImageBitmap(file, { imageOrientation: "from-image" })
      .then((bitmap) => {
        try {
          resolve(paint(bitmap, bitmap.width, bitmap.height));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Couldn’t read that photo."));
        } finally {
          bitmap.close();
        }
      })
      .catch(() => fromElement());
  });
}
