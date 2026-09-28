/**
 * The instructions every model gets for reading a label, so they all answer
 * the same way and their output parses the same way.
 *
 * Plain text rather than JSON: a verbatim transcription is long free text
 * full of quotes and line breaks, which models escape unreliably inside a
 * JSON string, and the government-warning check needs that text exactly.
 * The three facts that need structure go on fixed trailing lines instead.
 * Gemini runs at temperature 0: this is transcription, and its default
 * sampling made the same label read differently from one run to the next.
 * (Claude Sonnet 5 rejects a temperature setting, so Claude calls omit it.)
 */

const SEPARATE_LABEL_INTRO = `You are reading the label of one alcoholic beverage product for a TTB compliance review. Every attached image is part of that same product's label (for example the front, back, neck, or strip label). Images may be photos taken at an angle, with glare, or on a curved bottle.`;

// A single file holding both the application and the label (a scanned
// paper filing, or a registry page saved as PDF). The model separates them,
// since cropping by position had to be redone for every form layout.
const EMBEDDED_LABEL_INTRO = `You are reading the label of one alcoholic beverage product for a TTB compliance review. The attached document is a COLA application (TTB Form 5100.31) with that product's label images attached to it, usually below the heading "AFFIX COMPLETE SET OF LABELS BELOW". There may be several label images (front, back, neck, strip).

Read ONLY the label images. Ignore everything that belongs to the form itself: its printed headings and field names, the typed or handwritten answers, signatures, stamps, dates, and TTB notes or qualifications. Treat "the label" below as meaning only those attached label images.`;

const INSTRUCTIONS = `Step 1. Transcribe all text visible on every label image, exactly as printed. Include text printed sideways, vertically, upside down, or along a curve -- the government warning is often printed as a narrow vertical strip, so check every edge and orientation. Keep the original spelling, punctuation, capitalization, and line breaks, including any typos or missing words. Do not correct, translate, summarize, or add anything. This matters most for the "GOVERNMENT WARNING" statement: labels sometimes misprint it (a missing letter or word), so read it word by word from the image -- never fill it in from the standard wording you know. Output plain text only: no headings, no markdown, no labels such as "Front:" or "Transcription:", and no commentary. Put one blank line between images.

Step 2. After the transcription, write exactly these three lines:
BRAND_NAME: the brand name as printed on the label, or NONE
CLASS_TYPE: the class/type designation as printed (for example "Kentucky Straight Bourbon Whiskey", "Red Wine", "Ale"), or NONE
EMPHASIS: yes if the words "GOVERNMENT WARNING" appear in bold or visibly heavier or larger than the text after them, no if they do not, or unknown if those words are not on the label`;

export function buildLabelPrompt(labelIsInsideApplication: boolean): string {
  return `${labelIsInsideApplication ? EMBEDDED_LABEL_INTRO : SEPARATE_LABEL_INTRO}\n\n${INSTRUCTIONS}`;
}

export interface LabelReading {
  /** Verbatim label text, with the trailing structured lines removed. */
  rawText: string;
  brandName: string | null;
  classType: string | null;
  /** null when the model couldn't tell, or the warning isn't present. */
  leadInEmphasized: boolean | null;
}

const TRAILER_LINE = /^[\s*_`]*(BRAND_NAME|CLASS_TYPE|EMPHASIS)[\s*_`]*:\s*(.*?)\s*$/gim;

export function parseLabelResponse(full: string): LabelReading {
  const values: Record<string, string> = {};
  for (const m of full.matchAll(TRAILER_LINE)) values[m[1].toUpperCase()] = m[2].replace(/^["']|["']$/g, "").trim();

  const clean = (v: string | undefined) => (!v || /^none$/i.test(v) ? null : v);
  const emphasis = values.EMPHASIS?.toLowerCase();

  return {
    rawText: full.replace(TRAILER_LINE, "").trim(),
    brandName: clean(values.BRAND_NAME),
    classType: clean(values.CLASS_TYPE),
    leadInEmphasized: emphasis === "yes" ? true : emphasis === "no" ? false : null,
  };
}
