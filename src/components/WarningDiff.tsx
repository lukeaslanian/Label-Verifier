import { REQUIRED_WARNING_TEXT } from "@/lib/types";
import { diffWords, type DiffPart } from "@/lib/wordDiff";

// The warning has two numbered parts; only the ones that differ are shown.
const splitParts = (text: string) => text.split(/(?=\(\s*2\s*\))/);

function Line({ title, parts, show }: { title: string; parts: DiffPart[]; show: "required" | "label" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</span>
      <p className="leading-relaxed">
        {parts.map((part, i) => {
          if (part.kind === "same") return <span key={i}>{part.tokens.join(" ")} </span>;
          if (show === "required" && part.kind === "missing") {
            return (
              <span key={i}>
                <mark className="rounded-sm bg-alert-tint px-1 font-bold text-alert">{part.tokens.join(" ")}</mark>{" "}
              </span>
            );
          }
          if (show === "label" && part.kind === "extra") {
            return (
              <span key={i}>
                <mark className="rounded-sm bg-alert-tint px-1 font-bold text-alert">{part.tokens.join(" ")}</mark>{" "}
              </span>
            );
          }
          // A misspelled word shows as the wrong word on the label, with no
          // separate "missing" marker, since it was swapped rather than dropped.
          const swapped = parts[i - 1]?.kind === "extra" || parts[i + 1]?.kind === "extra";
          if (show === "label" && part.kind === "missing" && !swapped) {
            return (
              <span key={i}>
                <mark
                  className="rounded-sm border border-dashed border-alert bg-transparent px-1 text-sm text-alert"
                  title={`Missing: ${part.tokens.join(" ")}`}
                >
                  missing {part.tokens.length} word{part.tokens.length === 1 ? "" : "s"}
                </mark>{" "}
              </span>
            );
          }
          return null;
        })}
      </p>
    </div>
  );
}

/** The required warning next to what the label says, with the differences marked. */
export function WarningDiff({ onLabel }: { onLabel: string }) {
  const required = splitParts(REQUIRED_WARNING_TEXT);
  const label = splitParts(onLabel);
  const pairs =
    required.length === label.length
      ? required.map((r, i) => diffWords(r, label[i]))
      : [diffWords(REQUIRED_WARNING_TEXT, onLabel)];
  const differing = pairs.filter((parts) => parts.some((p) => p.kind !== "same"));

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-divider bg-bg p-4">
      {differing.map((parts, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Line title="Required" parts={parts} show="required" />
          <Line title="On the label" parts={parts} show="label" />
        </div>
      ))}
    </div>
  );
}
