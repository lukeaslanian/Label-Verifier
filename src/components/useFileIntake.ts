"use client";

import { useState } from "react";
import { isIgnored, isPage, labelLinks, organize, type Entry } from "@/lib/pairing";
import type { DroppedFile } from "./DropArea";

/** Everything dropped, organized into applications (see lib/pairing.ts). */
export function useFileIntake() {
  const [entries, setEntries] = useState<Entry[]>([]);

  async function add(files: DroppedFile[]) {
    const kept = files.filter(({ path }) => !isIgnored(path));
    // A saved page's image links say which files are its labels.
    const withLinks = await Promise.all(
      kept.map(async ({ file, path }) => ({ file, path, links: isPage(path) ? labelLinks(await file.text()) : undefined }))
    );

    setEntries((current) => {
      const known = new Set(current.map((e) => e.id));
      const shownPaths = new Set(current.map((e) => e.path));
      const added: Entry[] = [];
      for (const { file, path, links } of withLinks) {
        // The same file dropped twice is skipped; different files that
        // happen to share a name are both kept.
        const id = `${path}:${file.size}:${file.lastModified}`;
        if (known.has(id)) continue;
        known.add(id);
        // Loose files with the same name ("index.html" from two places) get numbered.
        let shown = path;
        for (let n = 2; shownPaths.has(shown); n++) shown = path.replace(/(\.[^./]+)?$/, ` (${n})$1`);
        shownPaths.add(shown);
        added.push({ id, file: new File([file], shown, { type: file.type }), path: shown, links });
      }
      return [...current, ...added];
    });
  }

  const remove = (id: string) => setEntries((current) => current.filter((e) => e.id !== id));
  const clear = () => setEntries([]);

  return { entries, applications: organize(entries), add, remove, clear };
}
