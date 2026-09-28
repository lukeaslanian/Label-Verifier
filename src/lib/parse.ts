// Reading alcohol content, volume, and product category out of free text,
// for both the label and the application.

// "alc" is required so a grape breakdown like "40% Xarel-lo" isn't read as
// ABV. Both orders are real ("12% Alc" and Deutz's "Alc.12% by vol."),
// nothing is required after "alc" because Bienvenida prints
// "14.5%ALCBYVOL", and European labels use a decimal comma ("13,5%").
export const ABV_PATTERN =
  /\b\d{1,3}([.,]\d+)?\s*%\s*alc(ohol)?|\balc(ohol)?\.?\s*\d{1,3}([.,]\d+)?\s*%|\b\d{1,3}([.,]\d+)?\s*proof\b/i;

// One quantity + unit. A bare "oz" is fluid ounces (Highland's application
// says "12 oz."); alcohol is never sold by weight.
const VOLUME_TERM =
  /(\d+(?:[.,]\d+)?)\s*(milli?lit(?:er|re)s?|ml|lit(?:er|re)s?|l|fluid\s*ounces?|fl\.?\s*oz|oz|pints?|pt|quarts?|qt|gallons?|gal)\.?(?![a-z])/gi;
// Net contents can be compound ("1 PINT 6 FL. OZ." on Guinness), so the
// label pattern takes a run of consecutive quantity+unit terms.
export const NET_CONTENTS_PATTERN = new RegExp(`(?:${VOLUME_TERM.source}[\\s,]*)+`, "i");

const ML_PER_UNIT: [RegExp, number][] = [
  [/^milli|^ml$/i, 1],
  [/^l/i, 1000],
  [/^fl|^fluid|^oz$/i, 29.5735],
  [/^p/i, 473.176],
  [/^q/i, 946.353],
  [/^gal/i, 3785.41],
];

export const MALT_BEVERAGE = /\b(beer|ales?|lager|stout|porter|pilsner|ipa|malt\s+(beverage|liquor))\b/i;

/** "13,5" is a decimal comma; "1,000" is a thousands separator. */
function toNumber(raw: string): number {
  return Number(/^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", "."));
}

function firstNumber(text: string): number | null {
  const m = text.match(/\d+(?:[.,]\d+)?/);
  return m ? toNumber(m[0]) : null;
}

/** ABV as a percentage; a proof-only statement ("90 Proof") is halved. */
export function parseAbv(text: string): number[] {
  const n = firstNumber(text);
  if (n === null) return [];
  return [/proof/i.test(text) && !/%/.test(text) ? n / 2 : n];
}

/**
 * Every volume stated, in mL. One COLA can cover several bottle sizes
 * (Rhumbero's application lists "750 MILLILITERS, 1 LITER, 1.5 LITERS"),
 * so each size is its own candidate. The exception is fluid ounces
 * following a pint/quart/gallon, which add onto it ("1 pint 6 fl. oz." on
 * Guinness is one 650 mL size). A bare number is taken as mL.
 */
export function parseVolumesMl(text: string): number[] {
  const sizes: number[] = [];
  let previousUnit = "";
  for (const [, qty, unit] of text.matchAll(VOLUME_TERM)) {
    const perUnit = ML_PER_UNIT.find(([pattern]) => pattern.test(unit))?.[1];
    if (perUnit === undefined) continue;
    const ml = toNumber(qty) * perUnit;
    const addsOn = /^(fl|fluid|oz)/i.test(unit) && /^(p|q|gal)/i.test(previousUnit);
    if (addsOn) sizes[sizes.length - 1] += ml;
    else sizes.push(ml);
    previousUnit = unit;
  }
  if (sizes.length > 0) return sizes;
  const bare = firstNumber(text);
  return bare === null ? [] : [bare];
}

export const sameAbv = (a: number, b: number) => Math.abs(a - b) < 0.05;
// 1.5% absorbs unit rounding: 12 fl oz is 354.9 mL, printed as "355 mL".
export const sameVolume = (a: number, b: number) => Math.abs(a - b) <= 0.015 * Math.max(a, b);

/** True if any value in one list matches any value in the other. */
export const anyMatch = (a: number[], b: number[], same: (x: number, y: number) => boolean) =>
  a.some((x) => b.some((y) => same(x, y)));

export type Category = "wine" | "malt beverage" | "distilled spirits";

/** A product category from free text: a TYPE OF PRODUCT answer, a TTB
 * class/type description ("TABLE WHITE WINE", "STOUT"), or a label's own
 * designation. */
export function parseCategory(text: string | null): Category | null {
  if (!text) return null;
  if (MALT_BEVERAGE.test(text) || /\bmalt\b/i.test(text)) return "malt beverage";
  if (/\b(wine|champagne|sherry|port|vermouth|cider|sake|mead)\b/i.test(text)) return "wine";
  if (/\b(whisk(e)?y|bourbon|scotch|vodka|gin|rum|tequila|mezcal|brandy|cognac|liqueur|spirits?|schnapps)\b/i.test(text)) {
    return "distilled spirits";
  }
  return null;
}
