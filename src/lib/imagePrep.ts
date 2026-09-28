import convert from "heic-convert";
import sharp from "sharp";

const MAX_DIMENSION = 1600;

function looksLikeHeic(filename: string, mimeType: string): boolean {
  return /\.hei[cf]$/i.test(filename) || mimeType === "image/heic" || mimeType === "image/heif";
}

function looksLikePdf(filename: string, mimeType: string): boolean {
  return /\.pdf$/i.test(filename) || mimeType === "application/pdf";
}

function looksLikeHtml(filename: string, mimeType: string): boolean {
  return /\.html?$/i.test(filename) || mimeType === "text/html";
}

export interface ProcessedUpload {
  buffer: Buffer;
  mimeType: "image/png" | "application/pdf" | "text/html";
}

/**
 * Gets any upload ready for the vision models:
 *
 * - PDF: passed through. Every model reads PDFs directly, which handles
 *   multi-page files better than turning them into images here.
 * - HTML: passed through. It's a saved registry page, read as text (see
 *   extractApplication.ts).
 * - Any image, including iPhone HEIC photos the models don't accept:
 *   rotated upright, shrunk to 1600px at most (full-size phone photos are
 *   slower and no easier to read), and saved as PNG so text edges stay sharp.
 *
 * Word documents and other office files aren't supported. The models don't
 * take them, and converting them would need a lot more server setup.
 */
export async function toProcessableUpload(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ProcessedUpload> {
  if (looksLikePdf(filename, mimeType)) {
    // Some PDFs have junk before the header. A real COLA PDF started with a
    // leaked PHP warning, which the vision APIs reject as invalid.
    const start = buffer.subarray(0, 4096).indexOf("%PDF-");
    if (start === -1) throw new Error(`${filename} isn't a readable PDF.`);
    return { buffer: buffer.subarray(start), mimeType: "application/pdf" };
  }
  if (looksLikeHtml(filename, mimeType)) {
    return { buffer, mimeType: "text/html" };
  }

  const decodable = looksLikeHeic(filename, mimeType)
    ? Buffer.from(await convert({ buffer, format: "PNG" }))
    : buffer;

  const png = await sharp(decodable)
    .rotate() // apply EXIF orientation before resizing
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { buffer: png, mimeType: "image/png" };
}
