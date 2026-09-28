"use client";

import { Fragment, useState } from "react";
import { ArrowCounterClockwiseIcon, CaretDownIcon, CheckCircleIcon, DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { VerificationResult } from "@/lib/types";
import { exportRunToXlsx } from "@/lib/exportXlsx";
import { FieldTag, VerdictChip } from "./Verdicts";
import { Spinner } from "./Spinner";
import { WarningDiff } from "./WarningDiff";
import { parseAbv, parseVolumesMl } from "@/lib/parse";
import { diffLetters } from "@/lib/wordDiff";
import type { FieldResult } from "@/lib/types";

export interface ResultRow {
  applicationFilename: string;
  labelFilenames: string[];
  /** null while it's still being checked. */
  result: VerificationResult | null;
}

const firstSentence = (text?: string) => (text ?? "").split(/(?<=\.) /)[0];

const TONE = {
  fail: "bg-alert-tint text-alert-on-tint",
  review: "bg-caution-tint text-caution-on-tint",
  pass: "",
} as const;

function Mark({ verdict, children }: { verdict: FieldResult["verdict"]; children: React.ReactNode }) {
  return <mark className={`rounded-sm px-1 font-semibold ${TONE[verdict]}`}>{children}</mark>;
}

/** Adds the conversion when a value isn't already in the unit it's compared in. */
function withConversion(field: FieldResult["field"], text: string): string {
  if (field === "netContents" && /[a-z]/i.test(text) && !/\bm\s?l\b|millilit/i.test(text)) {
    const sizes = parseVolumesMl(text);
    if (sizes.length > 0) return `${text} (${sizes.map((v) => `${Math.round(v)} mL`).join(" / ")})`;
  }
  if (field === "alcoholContent" && /proof/i.test(text) && !/%/.test(text)) {
    const [abv] = parseAbv(text);
    if (abv !== undefined) return `${text} (${abv}% ABV)`;
  }
  return text;
}

/** One side of a field. Near-miss brand names highlight just the letters
 * that differ; any other problem value is highlighted whole. */
function FieldValue({ f, side }: { f: FieldResult; side: "application" | "label" }) {
  const value = side === "application" ? f.expected : f.found;
  if (!value) return <span className="text-muted">{side === "application" ? "Not listed" : "Not found"}</span>;
  const text = withConversion(f.field, value);
  if (f.verdict === "pass") return <span className="line-clamp-3">{text}</span>;

  if (f.field === "brandName" && f.expected && f.found) {
    const shown = side === "application" ? "missing" : "extra";
    return (
      <span>
        {diffLetters(f.expected, f.found).map((part, i) =>
          part.kind === "same" ? (
            <span key={i}>{part.tokens.join("")}</span>
          ) : part.kind === shown ? (
            <Mark key={i} verdict={f.verdict}>
              {part.tokens.join("")}
            </Mark>
          ) : null
        )}
      </span>
    );
  }
  return side === "label" ? <Mark verdict={f.verdict}>{text}</Mark> : <span>{text}</span>;
}

function ResultTable({ result }: { result: VerificationResult }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Application</th>
          <th>Label</th>
          <th style={{ textAlign: "right" }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {result.fields.map((f) => {
          // A misworded warning gets a side-by-side of the required text and
          // the label, since the difference is often a few words in a long sentence.
          const showDiff = f.field === "governmentWarning" && f.verdict !== "pass" && f.found && /wording doesn't match/.test(f.note ?? "");
          const note = showDiff ? f.note?.replace(/^The wording doesn't match the required text\. After .*?"\.\s*/, "") : f.note;
          return (
            <Fragment key={f.field}>
              <tr>
                <td className="text-muted">{f.label}</td>
                <td>
                  <FieldValue f={f} side="application" />
                </td>
                <td>
                  {showDiff ? <span className="font-semibold">The wording is different. See below.</span> : <FieldValue f={f} side="label" />}
                  {note && <p className="mt-1 text-sm text-muted">{note}</p>}
                </td>
                <td style={{ textAlign: "right" }}>
                  <FieldTag verdict={f.verdict} />
                </td>
              </tr>
              {showDiff && (
                <tr>
                  <td colSpan={4}>
                    <WarningDiff onLabel={f.found!} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** A headline card for the run, then every application with its field-by-field table. */
export function Results({ rows, onStartOver }: { rows: ResultRow[]; onStartOver: () => void }) {
  const results = rows.flatMap((r) => (r.result ? [r.result] : []));
  const done = results.length;
  const running = done < rows.length;
  const count = (v: string) => results.filter((r) => r.overallVerdict === v).length;
  const problems = count("fail") + count("review");

  // Problems open by default; passes stay folded.
  const [toggled, setToggled] = useState<Set<number>>(new Set());
  const isOpen = (i: number) => {
    const r = rows[i].result;
    if (!r) return false;
    return (r.overallVerdict !== "pass") !== toggled.has(i);
  };
  const toggle = (i: number) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {running ? (
            <Spinner className="h-8 w-8 text-accent" />
          ) : problems === 0 ? (
            <CheckCircleIcon size={36} weight="duotone" className="text-accent" aria-hidden />
          ) : (
            <WarningCircleIcon size={36} weight="duotone" className="text-alert" aria-hidden />
          )}
          <div className="flex flex-col">
            <span className="text-2xl font-semibold">
              {running
                ? `Checking... ${done} of ${rows.length} done`
                : problems === 0
                  ? rows.length === 1
                    ? "The label matches"
                    : `All ${rows.length} labels match`
                  : `${problems} need${problems === 1 ? "s" : ""} attention`}
            </span>
            <span className="text-sm text-muted">
              {count("pass")} passed · {count("fail")} failed · {count("review")} need review
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" disabled={running} onClick={() => exportRunToXlsx(results)}>
            <DownloadSimpleIcon size={18} weight="duotone" aria-hidden />
            Download (XLSX)
          </button>
          <button className="btn btn-secondary" disabled={running} onClick={onStartOver}>
            <ArrowCounterClockwiseIcon size={18} weight="duotone" aria-hidden />
            Start over
          </button>
        </div>
      </div>

      <div className="flex flex-col">
        {rows.map((row, i) => {
          const r = row.result;
          const open = isOpen(i);
          return (
            <div key={i} className="border-t border-divider">
              <button
                className="flex w-full items-center justify-between gap-4 py-4 text-left disabled:cursor-default"
                onClick={() => toggle(i)}
                disabled={!r}
                aria-expanded={open}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-lg font-semibold">{row.applicationFilename}</span>
                  <span className="truncate text-sm text-muted">
                    {row.labelFilenames.length > 0 ? row.labelFilenames.join(", ") : "Label read from inside the application"}
                  </span>
                  {r && r.overallVerdict !== "pass" && !open && (
                    <span className="mt-1 text-sm">
                      {r.error ??
                        r.fields
                          .filter((f) => f.verdict !== "pass")
                          .map((f) => `${f.label}: ${firstSentence(f.note)}`)
                          .join(" · ")}
                    </span>
                  )}
                </span>
                {r ? (
                  <span className="flex shrink-0 items-center gap-3">
                    <VerdictChip verdict={r.overallVerdict} />
                    <CaretDownIcon
                      size={18}
                      className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
                    <Spinner />
                    Checking...
                  </span>
                )}
              </button>
              {open && r && (
                <div className="pb-4">
                  {r.error && <p className="pb-3 text-alert">{r.error}</p>}
                  {r.fields.length > 0 && <ResultTable result={r} />}
                  <p className="pt-2 text-xs text-muted">
                    Read by {r.readBy.join(", then ") || "no model"} · {(r.elapsedMs / 1000).toFixed(1)}s
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
