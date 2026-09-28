export function normalizeText(text: string): string {
  return text
    .normalize("NFKD") // splits accented letters ("é", "İ") into the letter plus its mark
    .replace(/[̀-ͯ]/g, "") // then drops the mark
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) dist[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
}

/**
 * 1.0 = the same once case and punctuation are ignored ("STONE'S THROW" vs
 * "Stone's Throw"), down to 0.0 = completely different.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/**
 * Slides a window about the length of `target` across `rawText` and
 * returns the best-scoring substring. Used to find the application's brand
 * anywhere on the label, since guessing the brand from the top line broke
 * on a real label with a "Made with Organically Grown Grapes" badge above it.
 */
export function findBestSubstring(target: string, rawText: string): { found: string | null; score: number } {
  const words = rawText.split(/\s+/).filter(Boolean);
  const targetWordCount = Math.max(1, normalizeText(target).split(" ").filter(Boolean).length);

  let best: { found: string | null; score: number } = { found: null, score: 0 };
  for (let windowSize = Math.max(1, targetWordCount - 1); windowSize <= targetWordCount + 2; windowSize++) {
    for (let i = 0; i + windowSize <= words.length; i++) {
      const candidate = words.slice(i, i + windowSize).join(" ");
      const score = similarity(target, candidate);
      if (score > best.score) best = { found: candidate, score };
    }
  }
  return best;
}
