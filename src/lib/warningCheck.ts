import { REQUIRED_WARNING_TEXT, type Verdict } from "./types";

export interface WarningCheckResult {
  found: string | null;
  verdict: Verdict;
  note: string;
}

// Compares letters and digits only, so line breaks, spacing, and line-end
// hyphens ("AC- CORDING" on King George IV) never cause a false mismatch.
const lettersAndDigits = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = (text: string) =>
  text.toUpperCase().replace(/([A-Z])-\s*([A-Z])/g, "$1$2").replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/** Where the label's wording first differs from the required text, so an
 * agent can find the spot on the label quickly. */
function describeDifference(labelText: string): string {
  const required = words(REQUIRED_WARNING_TEXT);
  const onLabel = words(labelText);
  let i = 0;
  while (i < required.length && required[i] === onLabel[i]) i++;
  const before = required.slice(Math.max(0, i - 3), i).join(" ");
  const expected = required.slice(i, i + 6).join(" ");
  const actual = onLabel.slice(i, i + 6).join(" ") || "nothing further";
  return `After "${before}", the required text continues "${expected}..." but the label has "${actual}...".`;
}

/**
 * Checks the government warning against the exact required wording, with
 * "GOVERNMENT WARNING" in all caps (27 CFR 16.22 also requires it in bold;
 * that comes from the vision model's judgment and is noted, not failed).
 */
export function checkGovernmentWarning(labelText: string, leadInLooksBold: boolean | null): WarningCheckResult {
  const idx = labelText.toUpperCase().indexOf("GOVERNMENT WARNING");
  if (idx === -1) {
    return { found: null, verdict: "fail", note: "No government warning statement found on the label." };
  }

  const fromWarning = labelText.slice(idx);
  const required = lettersAndDigits(REQUIRED_WARNING_TEXT);
  // What the agent sees is the statement through "PROBLEMS" when it's there
  // (line-end hyphens make it longer than the required text).
  const oneLine = fromWarning.replace(/\s+/g, " ");
  const end = oneLine.toUpperCase().indexOf("HEALTH PROBLEMS");
  const found = end === -1 ? oneLine.slice(0, REQUIRED_WARNING_TEXT.length) : oneLine.slice(0, end + "HEALTH PROBLEMS.".length);
  const leadIn = fromWarning.slice(0, "GOVERNMENT WARNING".length);

  if (lettersAndDigits(fromWarning).slice(0, required.length) !== required) {
    return { found, verdict: "fail", note: `The wording doesn't match the required text. ${describeDifference(fromWarning)}` };
  }
  if (leadIn !== leadIn.toUpperCase()) {
    return { found, verdict: "fail", note: `"GOVERNMENT WARNING" must be in all capital letters; the label has "${leadIn}".` };
  }
  if (leadInLooksBold === true) {
    return { found, verdict: "pass", note: "Wording, capitals, and bold all match the requirement." };
  }
  // Bold is a visual judgment the models disagree on (Claude Sonnet called
  // "GOVERNMENT WARNING" not bold on 6 TTB-approved labels), so it doesn't
  // fail the label. It's flagged for the reviewer to glance at.
  return {
    found,
    verdict: "pass",
    note:
      leadInLooksBold === false
        ? 'Wording and capitals are correct. Check the bolding: "GOVERNMENT WARNING" didn\'t look bold to the model.'
        : 'Wording and capitals are correct. Check the bolding: the model couldn\'t tell whether "GOVERNMENT WARNING" is bold.',
  };
}
