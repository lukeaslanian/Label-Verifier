export type DiffPart =
  | { kind: "same"; tokens: string[]; expectedCount: number }
  | { kind: "missing"; tokens: string[]; expectedCount: number } // expected, but not on the label
  | { kind: "extra"; tokens: string[]; expectedCount: number }; // on the label, but not expected
// `tokens` are what to show (the label's words, or the expected ones that
// are missing); `expectedCount` is how many expected words the part covers.

/** Longest-common-subsequence diff of two token lists, compared by `key`. */
function diffTokens(a: string[], b: string[], key: (t: string) => string): DiffPart[] {
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], token: string) => {
    const covers = kind === "extra" ? 0 : 1;
    const last = parts[parts.length - 1];
    if (last?.kind === kind) {
      last.tokens.push(token);
      last.expectedCount += covers;
    } else parts.push({ kind, tokens: [token], expectedCount: covers });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && key(a[i]) === key(b[j])) {
      push("same", b[j]);
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      push("extra", b[j++]);
    } else {
      push("missing", a[i++]);
    }
  }
  return parts;
}

/**
 * Word by word, ignoring punctuation and case, for the government warning.
 * A word split by a line-end hyphen on the label ("AC- CORDING") is joined
 * first, so it isn't flagged.
 */
export function diffWords(expected: string, onLabel: string): DiffPart[] {
  const a = expected.split(/\s+/).filter(Boolean);
  const b = onLabel.replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1$2").split(/\s+/).filter(Boolean);
  return mergeSplitWords(diffTokens(a, b, letters));
}

const letters = (w: string) => w.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A word broken across a line with its hyphen lost ("SUR GEON") shows up
 * as extra + missing words with the same letters. That's a match. */
function mergeSplitWords(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (let i = 0; i < parts.length; i++) {
    const [x, y] = [parts[i], parts[i + 1]];
    if (x.kind !== "same" && y && y.kind !== "same" && x.kind !== y.kind) {
      const extra = x.kind === "extra" ? x : y;
      const missing = x.kind === "missing" ? x : y;
      if (extra.tokens.map(letters).join("") === missing.tokens.map(letters).join("")) {
        out.push({ kind: "same", tokens: extra.tokens, expectedCount: missing.expectedCount });
        i++;
        continue;
      }
    }
    out.push(x);
  }
  // Join neighboring "same" runs back together.
  return out.reduce<DiffPart[]>((acc, part) => {
    const last = acc[acc.length - 1];
    if (last && last.kind === part.kind) {
      last.tokens.push(...part.tokens);
      last.expectedCount += part.expectedCount;
    } else acc.push({ ...part, tokens: [...part.tokens] });
    return acc;
  }, []);
}

/** Letter by letter, ignoring case, for a brand name that's close but not the same. */
export function diffLetters(expected: string, onLabel: string): DiffPart[] {
  return diffTokens([...expected], [...onLabel], (c) => c.toUpperCase());
}
