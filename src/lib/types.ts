export type Verdict = "pass" | "review" | "fail";

export type LabelField = "brandName" | "classType" | "alcoholContent" | "netContents" | "governmentWarning";

export interface FieldResult {
  field: LabelField;
  label: string;
  /** What the application says for this field, if anything. */
  expected: string | null;
  /** What was read off the label for this field, if anything. */
  found: string | null;
  verdict: Verdict;
  note?: string;
}

/** One label (one or more images: front, back, neck...) checked against one application. */
export interface VerificationResult {
  labelFilenames: string[];
  applicationFilename: string;
  overallVerdict: Verdict;
  fields: FieldResult[];
  /** Which models read the label, e.g. ["Gemini Flash-Lite", "Claude Sonnet"] when a
   * second opinion was needed. */
  readBy: string[];
  elapsedMs: number;
  /** Set when the application couldn't be processed at all. */
  error?: string;
}

export interface VerificationRecord {
  id: number;
  createdAt: string;
  overallVerdict: Verdict;
  results: VerificationResult[];
}

export const REQUIRED_WARNING_TEXT =
  "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.";

