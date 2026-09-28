"use client";

import { useState } from "react";
import { UploadSimpleIcon } from "@phosphor-icons/react";

export interface DroppedFile {
  file: File;
  /** Path including folders, e.g. "Real Samples/areni_files/label.jpg". */
  path: string;
}

async function readEntry(entry: FileSystemEntry): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, path: entry.fullPath.replace(/^\//, "") }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries returns results in batches until it returns an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(readEntry))).flat();
}

/** One place to drop everything: applications, label images, or whole folders. */
export function DropArea({ onFiles }: { onFiles: (files: DroppedFile[]) => void }) {
  const [dragging, setDragging] = useState(false);

  const fromInput = (list: FileList | null) =>
    onFiles(Array.from(list ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name })));

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        const entries = Array.from(e.dataTransfer.items)
          .map((item) => item.webkitGetAsEntry?.())
          .filter((entry): entry is FileSystemEntry => !!entry);
        onFiles(
          entries.length > 0
            ? (await Promise.all(entries.map(readEntry))).flat()
            : Array.from(e.dataTransfer.files).map((file) => ({ file, path: file.name }))
        );
      }}
      className={`flex items-center gap-5 rounded-sm border-[1.5px] border-dashed p-6 transition-colors sm:p-8 ${
        dragging ? "border-accent bg-accent-tint" : "border-divider bg-bg hover:border-accent"
      }`}
    >
      <span className="grid size-14 flex-none place-items-center rounded-full bg-accent-tint-2 text-accent-text">
        <UploadSimpleIcon size={28} weight="duotone" aria-hidden />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-semibold">
          Drop files or folders here, or{" "}
          <label className="cursor-pointer text-accent-text underline underline-offset-4">
            browse
            <input
              type="file"
              multiple
              accept="image/*,application/pdf,text/html,.html,.htm"
              className="hidden"
              onChange={(e) => {
                fromInput(e.target.files);
                e.target.value = "";
              }}
            />
          </label>{" "}
          <span className="font-normal text-muted">or</span>{" "}
          <label className="cursor-pointer text-accent-text underline underline-offset-4">
            add a folder
            <input
              type="file"
              className="hidden"
              {...{ webkitdirectory: "" }}
              onChange={(e) => {
                fromInput(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </span>
        <span className="text-sm text-muted">
          One file per application: a scan, photo, PDF, or saved registry page (with its _files folder, which holds its
          label images). Drag in several folders at once, or add folders one after another.
        </span>
      </span>
    </div>
  );
}
