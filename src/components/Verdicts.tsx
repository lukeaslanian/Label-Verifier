import { CheckCircleIcon, QuestionIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Verdict } from "@/lib/types";

const FIELD: Record<Verdict, [string, string]> = {
  pass: ["tag tag-pass", "Match"],
  review: ["tag tag-review", "Check"],
  fail: ["tag tag-fail", "Mismatch"],
};

/** One field's status in the results table. */
export function FieldTag({ verdict }: { verdict: Verdict }) {
  const [className, text] = FIELD[verdict];
  return <span className={className}>{text}</span>;
}

const OVERALL: Record<Verdict, [string, string, typeof CheckCircleIcon]> = {
  pass: ["verdict verdict-pass", "Pass", CheckCircleIcon],
  review: ["verdict verdict-review", "Needs review", QuestionIcon],
  fail: ["verdict verdict-fail", "Fail", WarningCircleIcon],
};

/** An application's overall verdict: bright, with an icon so it never relies on color alone. */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const [className, text, Icon] = OVERALL[verdict];
  return (
    <span className={className}>
      <Icon size={18} weight="fill" aria-hidden />
      {text}
    </span>
  );
}
