import type { ProcessedUpload } from "./imagePrep";
import { REQUIRED_WARNING_TEXT } from "./types";
import { diffWords } from "./wordDiff";
import { readAnswerLine } from "./extractApplication";
import { visionModels } from "./vision/providers";

const REQUIRED_WORDS = REQUIRED_WARNING_TEXT.split(/\s+/);
// Letters only: "SUR- GEON" spelled across a line break is still SURGEON.
const letters = (words: string) => words.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The span of required words a reading disagrees on, with the words just
 * before and after it as landmarks. Only the first disagreement is used. */
function disputedSpan(reading: string): { start: number; end: number } | null {
  let index = 0;
  const parts = diffWords(REQUIRED_WARNING_TEXT, reading);
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    if (part.kind === "same") {
      index += part.expectedCount;
      continue;
    }
    // A swapped word shows up as extra + missing; a dropped one as missing;
    // an added one as extra alone (an empty span between two words).
    const missing = part.kind === "missing" ? part : parts[p + 1]?.kind === "missing" ? parts[p + 1] : null;
    return { start: index, end: index + (missing?.expectedCount ?? 0) };
  }
  return null;
}

export type SpellCheck =
  | { verdict: "correct" }
  | { verdict: "wrong"; onLabel: string; required: string; spelledBy: string[]; text: string }
  | { verdict: "unsure" };

/**
 * Models know the government warning by heart and tend to "read" the
 * standard wording even when a label misprints it. On a real Prinsi label
 * that says "WOMEN SHOUL NOT", two models transcribed "SHOULD". Asked to
 * spell just the disputed word, letter by letter, they're far more literal.
 * Given a reading that disagrees with the required text, this asks every
 * model to spell that spot.
 */
export async function spellCheckWarning(
  uploads: ProcessedUpload[],
  disagreeingReading: string
): Promise<SpellCheck> {
  const span = disputedSpan(disagreeingReading);
  if (!span) return { verdict: "correct" };

  const before = REQUIRED_WORDS.slice(Math.max(0, span.start - 2), span.start).join(" ");
  const after = REQUIRED_WORDS.slice(span.end, span.end + 2).join(" ");
  const required = REQUIRED_WORDS.slice(span.start, span.end).join(" ");

  const prompt = `Look only at the "GOVERNMENT WARNING" statement on this alcohol label. Find the words printed between "${before}" and "${after}".

Spell them exactly as printed, letter by letter. Labels sometimes misprint this warning -- a missing letter, a missing word -- so do not fill in the standard wording from memory. If nothing is printed between those words, answer NOTHING.

Answer with exactly one line:
WORDS: <the words exactly as printed, or NOTHING>`;

  // Every model, in parallel. One can garble a spelling (GPT-6 Luna did
  // here), so the spelling most of them agree on wins.
  const answers = await Promise.all(
    visionModels().map(async (m) => {
      try {
        // Room to answer: Claude Sonnet was cut off at 100 tokens.
        const words = readAnswerLine(await m.ask(prompt, uploads, 1024), "WORDS");
        return { by: m.name, words: !words || /^nothing$/i.test(words) ? "" : words };
      } catch {
        return null;
      }
    })
  );
  const spelled = answers.filter((a): a is { by: string; words: string } => a !== null);
  const votes = new Map<string, { words: string; by: string[] }>();
  for (const a of spelled) {
    const k = letters(a.words);
    const entry = votes.get(k) ?? { words: a.words, by: [] };
    entry.by.push(a.by);
    votes.set(k, entry);
  }
  const ranked = [...votes.entries()].sort((x, y) => y[1].by.length - x[1].by.length);
  const [top, runnerUp] = ranked;
  if (!top || top[1].by.length < 2 || (runnerUp && runnerUp[1].by.length === top[1].by.length)) return { verdict: "unsure" };
  if (top[0] === letters(required)) return { verdict: "correct" };

  const onLabel = top[1].words;

  // The label's warning with the spelled-out words in place, for display.
  const text = [...REQUIRED_WORDS.slice(0, span.start), ...(onLabel ? [onLabel] : []), ...REQUIRED_WORDS.slice(span.end)].join(" ");
  return { verdict: "wrong", onLabel, required, spelledBy: top[1].by, text };
}
