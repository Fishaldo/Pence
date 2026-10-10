import { compressImage, jpegDataUrl } from "@/lib/spend/image";

const MAX_PDF_PAGES = 4;

async function looksLikePdf(file: File): Promise<boolean> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return true;
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

async function pdfPages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const count = Math.min(doc.numPages, MAX_PDF_PAGES);
  const urls: string[] = [];
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    urls.push(jpegDataUrl(canvas, canvas.width, canvas.height));
  }
  return urls;
}

export async function fileToImages(file: File): Promise<string[]> {
  if (await looksLikePdf(file)) {
    const pages = await pdfPages(file);
    if (pages.length === 0) throw new Error("That PDF has no pages.");
    return pages;
  }
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    return [await compressImage(file)];
  }
  throw new Error("Use a photo or a PDF.");
}
