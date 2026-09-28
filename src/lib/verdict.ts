import type { Verdict } from "./types";

export function worstVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("review")) return "review";
  return "pass";
}
