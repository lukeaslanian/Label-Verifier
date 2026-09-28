import type { ProcessedUpload } from "./imagePrep";
import { parseCategory, type Category } from "./parse";
import { askFirstAvailable } from "./vision/providers";

export interface ApplicationFields {
  brandName: string | null;
  fancifulName: string | null;
  netContents: string | null;
  alcoholContent: string | null;
  /** Wine / malt beverage / distilled spirits, shown next to the label's class/type. */
  category: Category | null;
}

const NO_FIELDS: ApplicationFields = {
  brandName: null,
  fancifulName: null,
  netContents: null,
  alcoholContent: null,
  category: null,
};

const APPLICATION_PROMPT = `This is a TTB Form 5100.31 (COLA application for label approval). It may be a scan of a paper form with handwritten answers, and it may have the product's label pasted at the bottom. Read only the answers written in the form's fields, never text from the pasted label.

Field numbers differ between form editions, so find each field by its printed name, not its number.

Answer with exactly these five lines and nothing else:
BRAND_NAME: the answer in the BRAND NAME field, or NONE if blank
FANCIFUL_NAME: the answer in the FANCIFUL NAME field, or NONE if blank
NET_CONTENTS: the answer in the NET CONTENTS field, or NONE if blank
ALCOHOL_CONTENT: the answer in the ALCOHOL CONTENT field, or NONE if blank or only a placeholder with no number (such as "%abv")
TYPE_OF_PRODUCT: the box checked under TYPE OF PRODUCT (WINE, DISTILLED SPIRITS, or MALT BEVERAGE), or NONE`;

/** Parses "KEY: value" answer lines, treating NONE as blank. */
export function readAnswerLine(text: string, key: string): string | null {
  const v = text.match(new RegExp(`^[\\s*_\`]*${key}[\\s*_\`]*:\\s*(.+)$`, "im"))?.[1]?.trim();
  return !v || /^none$/i.test(v) ? null : v;
}

function parseVisionAnswer(text: string): ApplicationFields {
  return {
    brandName: readAnswerLine(text, "BRAND_NAME"),
    fancifulName: readAnswerLine(text, "FANCIFUL_NAME"),
    netContents: readAnswerLine(text, "NET_CONTENTS"),
    alcoholContent: readAnswerLine(text, "ALCOHOL_CONTENT"),
    category: parseCategory(readAnswerLine(text, "TYPE_OF_PRODUCT")),
  };
}

/**
 * Pulls one field's answer out of the plain text of a saved registry page
 * or a PDF's text layer. Anchored on the printed field name, never its
 * number, since numbering shifts between form editions (TTB's own COLAs Online
 * manual documents this). It's case-sensitive because real field headers
 * are always ALL CAPS, while the same words also appear lowercase in
 * instructions ("...EMBOSSED ON THE CONTAINER (e.g., net contents)...").
 * The answer runs until the next numbered field ("12. ", "8a. ").
 */
function readTextField(text: string, name: string): string | null {
  const pattern = new RegExp(
    String.raw`\b${name}\s*(?:\([^)]*\))?\s*:?\s*(?!\d{1,2}[a-z]?\.\s)(.+?)(?=\s+\d{1,2}[a-z]?\.\s+[A-Z]|\s*$)`
  );
  return text.match(pattern)?.[1]?.trim() || null;
}

function parseFormText(text: string): ApplicationFields | null {
  const brandName = readTextField(text, String.raw`BRAND\s*NAME`);
  if (!brandName) return null;
  // The TYPE OF PRODUCT checkboxes are images on a registry page, but TTB's
  // own class/type description ("TABLE WHITE WINE", "STOUT") is text.
  const classDescription = text.match(/CLASS\/TYPE DESCRIPTION\s+(.+?)\s+(?:EXPIRATION DATE|AFFIX|$)/)?.[1] ?? null;
  return {
    brandName,
    fancifulName: readTextField(text, String.raw`FANCIFUL\s*NAME`),
    netContents: readTextField(text, String.raw`NET\s*CONTENTS`),
    alcoholContent: readTextField(text, String.raw`ALCOHOL\s*CONTENT`),
    category: parseCategory(classDescription),
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The PDF's text layer, or null if it can't be read (then a vision model
 * reads the PDF instead). pdf.js expects browser drawing APIs (DOMMatrix)
 * that servers don't have, and pdf-parse/worker supplies them, so it's
 * loaded first. Both load here, only when a PDF comes in, so a problem
 * with them can't take down images or saved pages.
 */
async function pdfToText(buffer: Buffer): Promise<string | null> {
  let parser: { getText(): Promise<{ text: string }>; destroy(): Promise<void> } | null = null;
  try {
    const { CanvasFactory } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: buffer, CanvasFactory });
    return (await parser.getText()).text.replace(/\s+/g, " ").trim();
  } catch (err) {
    console.warn("Couldn't read the PDF's text, using a vision model instead", err);
    return null;
  } finally {
    await parser?.destroy();
  }
}

/**
 * Reads Brand Name, Fanciful Name, Net Contents, Alcohol Content, and
 * product category off a COLA application.
 *
 * - Saved registry page (HTML): parsed as text, no model call.
 * - PDF: text layer first; a vision model only if there isn't one.
 * - Image (e.g. a scanned paper filing): a vision model.
 *
 * Any field can be null, since newer e-filed forms only ask for net
 * contents when it isn't already printed on the label.
 */
export async function extractApplicationFields(upload: ProcessedUpload): Promise<ApplicationFields> {
  if (upload.mimeType === "text/html") {
    return parseFormText(htmlToText(upload.buffer.toString("utf-8"))) ?? NO_FIELDS;
  }
  if (upload.mimeType === "application/pdf") {
    const text = await pdfToText(upload.buffer);
    const parsed = text ? parseFormText(text) : null;
    if (parsed) return parsed;
  }
  return parseVisionAnswer((await askFirstAvailable(APPLICATION_PROMPT, [upload], 256)).text);
}
