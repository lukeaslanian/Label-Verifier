// One file per application, since a COLA application carries its own
// labels ("AFFIX COMPLETE SET OF LABELS BELOW"): a scan, photo, or PDF has
// them inside it, and a saved registry page links to them in its _files
// folder. So the only pairing needed is following a page's image links.

export interface Entry {
  id: string;
  file: File;
  /** Where it came from, including folders ("Real Samples/areni_files/x.jpg"). */
  path: string;
  /** Saved pages only: the label images it links to, as paths next to it. */
  links?: string[];
}

const USABLE = /\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|pdf|html?)$/i;
const IMAGE = /\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp)$/i;

const dirOf = (path: string) => path.split("/").slice(0, -1).join("/");
export const isPage = (path: string) => /\.html?$/i.test(path);

/** Page scripts, styles, and helper pages from a saved page's _files
 * folder, signature images, and hidden files aren't applications or labels. */
export function isIgnored(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  if (name.startsWith(".") || !USABLE.test(name)) return true;
  if (/_files\//.test(path) && !IMAGE.test(name)) return true;
  return /signature/i.test(name);
}

/** The label images a saved registry page shows, as paths relative to it. */
export function labelLinks(html: string): string[] {
  return [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)]
    .map((m) => {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    })
    .filter((src) => !/^[a-z]+:/i.test(src) && IMAGE.test(src.split("?")[0]) && !/signature/i.test(src))
    .map((src) => src.replace(/^\.\//, ""));
}

export interface Application {
  entry: Entry;
  /** Label images, in the order the page shows them. Empty = inside the file. */
  labels: Entry[];
  /** Saved page whose label images weren't included in the upload. */
  missingLabels: string[];
}

/**
 * Every saved page becomes an application with the images it links to as
 * its labels. Every other file is an application with the labels inside it.
 */
export function organize(entries: Entry[]): Application[] {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const used = new Set<string>();
  const pages: Application[] = entries
    .filter((e) => isPage(e.path))
    .map((page) => {
      const dir = dirOf(page.path);
      const labels: Entry[] = [];
      const missing: string[] = [];
      for (const link of page.links ?? []) {
        const label = byPath.get(dir ? `${dir}/${link}` : link);
        if (label) {
          labels.push(label);
          used.add(label.id);
        } else missing.push(link);
      }
      return { entry: page, labels, missingLabels: missing };
    });
  const others = entries
    .filter((e) => !isPage(e.path) && !used.has(e.id))
    .map((entry) => ({ entry, labels: [], missingLabels: [] }));
  return [...others, ...pages].sort((a, b) => a.entry.path.localeCompare(b.entry.path));
}
