import type { FieldResult, Verdict, VerificationResult } from "./types";
import type { ProcessedUpload } from "./imagePrep";
import { labelReaders, type LabelReadingResult } from "./vision";
import { extractApplicationFields, type ApplicationFields } from "./extractApplication";
import { findBestSubstring, normalizeText, similarity } from "./fuzzyMatch";
import { checkGovernmentWarning } from "./warningCheck";
import { worstVerdict } from "./verdict";
import { spellCheckWarning } from "./warningSpellCheck";
import {
  ABV_PATTERN,
  MALT_BEVERAGE,
  NET_CONTENTS_PATTERN,
  anyMatch,
  parseAbv,
  parseVolumesMl,
  sameAbv,
  sameVolume,
} from "./parse";

const BRAND_PASS = 0.92;
const BRAND_REVIEW = 0.75;

/**
 * A numeric label field (ABV or net contents) checked against the
 * application. Only a real disagreement fails. When one side is blank
 * there's nothing to contradict, so it passes with a note:
 *
 * - Application blank: newer e-filed forms only ask for these when they
 *   aren't already on the label (Chaglasian).
 * - Label blank: trusted to be on the container, since the application
 *   states it. Net contents can be blown into the glass (King George IV,
 *   Rhumbero), and ABV is optional on beer (Highland).
 * - Both blank: `absentEverywhere` decides (ABV is fine on beer; net
 *   contents is required on everything).
 */
function checkNumericField(
  field: "alcoholContent" | "netContents",
  label: string,
  pattern: RegExp,
  parse: (text: string) => number[],
  same: (a: number, b: number) => boolean,
  labelText: string,
  applicationValue: string | null,
  absentEverywhere: Pick<FieldResult, "verdict" | "note">
): FieldResult {
  const found = labelText.match(pattern)?.[0]?.trim() ?? null;

  if (!found && !applicationValue) return { field, label, expected: null, found: null, ...absentEverywhere };
  if (!applicationValue) {
    return { field, label, expected: null, found, verdict: "pass", note: "The application doesn't list this; the label states it." };
  }
  if (!found) {
    return {
      field,
      label,
      expected: applicationValue,
      found: null,
      verdict: "pass",
      note: "Not printed on the label images. It may be blown into the bottle, or optional. Confirm on the container if needed.",
    };
  }

  // Passes if the label matches any value the application lists.
  const onLabel = parse(found);
  const onApplication = parse(applicationValue);
  const verdict: Verdict =
    onLabel.length === 0 || onApplication.length === 0
      ? "review"
      : anyMatch(onLabel, onApplication, same)
        ? "pass"
        : "fail";
  return { field, label, expected: applicationValue, found, verdict };
}

/**
 * The brand and class/type the model reported for the label. When the label
 * was read from inside the application, each must also appear in the label
 * transcription, or it may have come from the form (Rhumbero's
 * page prints TTB's "DESSERT FLAVORED WINE" class description, which a
 * model once reported as the label's class/type).
 */
function reportedValue(value: string | null, reading: LabelReadingResult, labelIsInsideApplication: boolean): string | null {
  if (!value || !labelIsInsideApplication) return value;
  const onLabel = normalizeText(reading.rawText);
  return onLabel.includes(normalizeText(value)) || findBestSubstring(value, reading.rawText).score >= 0.8 ? value : null;
}

/** Every field check, for one reading of the label. */
export function checkFields(
  reading: LabelReadingResult,
  application: ApplicationFields,
  labelIsInsideApplication: boolean
): FieldResult[] {
  const reportedBrand = reportedValue(reading.brandName, reading, labelIsInsideApplication);
  const classType = reportedValue(reading.classType, reading, labelIsInsideApplication);

  let brand: FieldResult;
  if (application.brandName) {
    // Also try the brand the model reported, since stylized logos (Coors
    // Light's script) are often left out of a verbatim transcription.
    const inText = findBestSubstring(application.brandName, reading.rawText);
    const reported = reportedBrand
      ? { found: reportedBrand, score: similarity(application.brandName, reportedBrand) }
      : { found: null, score: 0 };
    const { found, score } = reported.score > inText.score ? reported : inText;
    brand = {
      field: "brandName",
      label: "Brand Name",
      found,
      verdict: score >= BRAND_PASS ? "pass" : score >= BRAND_REVIEW ? "review" : "fail",
      expected: application.brandName,
    };
  } else {
    brand = {
      field: "brandName",
      label: "Brand Name",
      expected: null,
      found: reportedBrand,
      verdict: "review",
      note: "The application's Brand Name couldn't be read, so there's nothing to match against.",
    };
  }

  const isMaltBeverage = MALT_BEVERAGE.test(`${classType ?? ""}\n${reading.rawText}`);
  const warning = checkGovernmentWarning(reading.rawText, reading.leadInEmphasized);

  return [
    brand,
    {
      field: "classType",
      label: "Class/Type",
      expected: application.category && application.category[0].toUpperCase() + application.category.slice(1),
      found: classType,
      verdict: classType ? "pass" : "review",
      note: classType ? undefined : "No class/type designation found on the label.",
    },
    checkNumericField(
      "alcoholContent",
      "Alcohol Content",
      ABV_PATTERN,
      parseAbv,
      sameAbv,
      reading.rawText,
      application.alcoholContent,
      isMaltBeverage
        ? { verdict: "pass", note: "No ABV on the label or application. That's optional for beer and other malt beverages." }
        : { verdict: "review", note: "No ABV on the label or application. It's required for spirits and most wine." }
    ),
    checkNumericField(
      "netContents",
      "Net Contents",
      NET_CONTENTS_PATTERN,
      parseVolumesMl,
      sameVolume,
      reading.rawText,
      application.netContents,
      { verdict: "review", note: "No net contents on the label or application." }
    ),
    {
      field: "governmentWarning",
      label: "Government Warning",
      expected: "Required wording",
      found: warning.found,
      verdict: warning.verdict,
      note: warning.note,
    },
  ];
}

interface Opinion {
  result: FieldResult;
  by: string;
}

const sameReading = (a: FieldResult, b: FieldResult) =>
  a.verdict === b.verdict && normalizeText(a.found ?? "") === normalizeText(b.found ?? "");

/**
 * One field's verdict from every model that has read the label so far.
 *
 * - A pass from any model settles most fields. A model can't invent the
 *   application's brand or numbers (it never sees them), so a pass means the
 *   others misread (a stylized logo, small print).
 * - The government warning is different. Models have the standard wording
 *   memorized and can "autocorrect" a misprinted one, so a pass only wins if
 *   more models passed it than failed it.
 * - With no pass, two models failing it with the same reading settles it (a
 *   real defect reads the same way twice). Different readings mean the image
 *   is hard to read, not that the label is wrong, so that goes to a person.
 *
 * `settled` says whether asking another model could still change anything.
 */
function decide(opinions: Opinion[]): { result: FieldResult; settled: boolean } {
  const [first] = opinions;
  const passes = opinions.filter((o) => o.result.verdict === "pass");
  const fails = opinions.filter((o) => o.result.verdict === "fail");

  if (passes.length > 0 && (first.result.field !== "governmentWarning" || passes.length > fails.length)) {
    const pass = passes[0];
    if (pass === first) return { result: first.result, settled: true };
    const firstSaw = first.result.verdict === "review" ? "wasn't sure" : `read "${first.result.found ?? "nothing"}"`;
    const note = [pass.result.note, `Confirmed by ${pass.by} (${first.by} ${firstSaw}).`].filter(Boolean).join(" ");
    return { result: { ...pass.result, note }, settled: true };
  }

  const agreeing = opinions.filter((o) => o !== first && sameReading(o.result, first.result));
  if (opinions.length === 1) return { result: first.result, settled: false };
  if (agreeing.length > 0 && passes.length === 0) {
    const group = [first, ...agreeing];
    const by = group.map((o) => o.by);
    const names =
      by.length === 2 ? `${by[0]} and ${by[1]} both` : `${by.slice(0, -1).join(", ")}, and ${by[by.length - 1]} all`;
    // Two models reading the same text settles it, whether it's a real defect
    // or a near-miss for a person to judge. Matching "couldn't find it" is just
    // repeated misses, so later models are still asked.
    const isFail = first.result.verdict === "fail";
    const note = `${first.result.note ?? ""} ${names} read it this way${isFail ? "" : ". Please confirm"}.`.trim();
    return { result: { ...first.result, note }, settled: isFail || first.result.found !== null };
  }

  const readings = opinions.map((o) => `${o.by}: "${o.result.found ?? "nothing"}"`).join("; ");
  return {
    result: {
      ...first.result,
      verdict: "review",
      note: `The models read this differently, so it may be hard to read on the image. Please confirm. ${readings}. ${first.result.note ?? ""}`.trim(),
    },
    settled: false,
  };
}

/**
 * Checks one label (all its images) against one COLA application. With no
 * label images, the label is read from inside the application document.
 *
 * - Brand Name: the application's brand is searched for anywhere on the
 *   label, fuzzy and case-insensitive ("STONE'S THROW" = "Stone's Throw").
 * - Alcohol Content, Net Contents: compared as numbers with units normalized;
 *   a value missing on one side passes with a note (see checkNumericField).
 * - Class/Type: must be present on the label. The application only has a
 *   Wine/Spirits/Malt checkbox, so there's no designation to match.
 * - Government Warning: exact wording and all caps; bold is a visual call,
 *   so it's noted for the reviewer rather than failed.
 *
 * The label is read by the first available model in labelReaders(). If it
 * errors, the next one reads it. If any field isn't settled, the next model
 * gives an opinion, and so on down the list (see decide).
 */
export async function verifyWithApplication(
  labelUploads: ProcessedUpload[],
  applicationUpload: ProcessedUpload,
  labelFilenames: string[],
  applicationFilename: string
): Promise<VerificationResult> {
  const startedAt = Date.now();

  // With no separate label files, the label is inside the application
  // itself (a scanned paper filing, or a registry page saved as a PDF).
  const labelIsInsideApplication = labelUploads.length === 0;
  if (labelIsInsideApplication && applicationUpload.mimeType === "text/html") {
    throw new Error(
      "This saved registry page came without its label images. Add its _files folder, which has them."
    );
  }
  const labelSource = labelIsInsideApplication ? [applicationUpload] : labelUploads;
  const readers = labelReaders();
  if (readers.length === 0) throw new Error("No vision API key is configured (see README).");

  const applicationPromise = extractApplicationFields(applicationUpload);
  const opinions: FieldResult[][] = [];
  const readBy: string[] = [];
  let fields: FieldResult[] = [];

  for (const reader of readers) {
    let reading;
    try {
      reading = await reader.read(labelSource, labelIsInsideApplication);
    } catch (err) {
      console.warn(`${reader.name} couldn't read the label, trying the next model`, err);
      continue;
    }
    opinions.push(checkFields(reading, await applicationPromise, labelIsInsideApplication));
    readBy.push(reading.readBy);

    const decisions = opinions[0].map((_, i) => decide(opinions.map((o, j) => ({ result: o[i], by: readBy[j] }))));
    fields = decisions.map((d) => d.result);
    if (decisions.every((d) => d.settled)) break;
  }

  if (readBy.length === 0) throw new Error("None of the vision models could read this label.");

  // If models disagree on the warning's wording, have them spell the
  // disputed spot letter by letter instead of voting (see warningSpellCheck.ts).
  const w = fields.findIndex((f) => f.field === "governmentWarning");
  const warningReadings = opinions.map((o) => o[w]);
  const wordingFails = warningReadings.filter((f) => f.verdict === "fail" && /wording doesn't match/.test(f.note ?? ""));
  const readingsDiffer = new Set(wordingFails.map((f) => normalizeText(f.found ?? ""))).size > 1;
  if (wordingFails.length > 0 && (wordingFails.length < warningReadings.length || readingsDiffer)) {
    const check = await spellCheckWarning(labelSource, wordingFails[0].found ?? "");
    const passing = warningReadings.find((f) => f.verdict === "pass");
    if (check.verdict === "wrong") {
      fields[w] = {
        ...fields[w],
        verdict: "fail",
        found: check.text,
        note: `The wording doesn't match the required text. Spelled letter by letter, the label has "${check.onLabel || "nothing"}" where it should say "${check.required}" (checked by ${check.spelledBy.length > 2 ? `${check.spelledBy.slice(0, -1).join(", ")}, and ${check.spelledBy.at(-1)}` : check.spelledBy.join(" and ")}).`,
      };
    } else if (check.verdict === "correct") {
      fields[w] = passing
        ? { ...passing, note: `${passing.note ?? ""} One model misread a word; spelled letter by letter, it matches.`.trim() }
        : { ...fields[w], verdict: "review", note: "The models misread the wording, but spelled letter by letter it matches. Please confirm the bolding and capitals." };
    } else {
      fields[w] = {
        ...fields[w],
        verdict: "review",
        found: wordingFails[0].found,
        note: "The models read the wording differently and couldn't agree even letter by letter. Please confirm.",
      };
    }
  }

  return {
    labelFilenames,
    applicationFilename,
    overallVerdict: worstVerdict(fields.map((f) => f.verdict)),
    fields,
    readBy,
    elapsedMs: Date.now() - startedAt,
  };
}
