"use client";

import { FileHtmlIcon, FileImageIcon, FilePdfIcon, TrashIcon } from "@phosphor-icons/react";
import type { Application, Entry } from "@/lib/pairing";

function FileIcon({ path }: { path: string }) {
  const props = { size: 24, weight: "duotone" as const, className: "flex-none text-muted", "aria-hidden": true };
  if (/\.pdf$/i.test(path)) return <FilePdfIcon {...props} />;
  if (/\.html?$/i.test(path)) return <FileHtmlIcon {...props} />;
  return <FileImageIcon {...props} />;
}

function Row({
  entry,
  kind,
  indent,
  warn,
  onRemove,
}: {
  entry: Entry;
  kind: string;
  indent?: boolean;
  warn?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 border-b border-divider py-2.5 ${indent ? "pl-8" : ""}`}>
      <FileIcon path={entry.path} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{entry.path}</span>
        <span className={`text-sm ${warn ? "text-alert" : "text-muted"}`}>{kind}</span>
      </span>
      {onRemove && (
        <button className="btn btn-icon flex-none" onClick={onRemove} aria-label={`Remove ${entry.path}`}>
          <TrashIcon size={20} weight="duotone" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Each application, with the label images a saved page links to listed under it. */
export function FileList({ applications, onRemove }: { applications: Application[]; onRemove: (id: string) => void }) {
  return (
    <div className="flex flex-col">
      {applications.map(({ entry, labels, missingLabels }) => {
        const isPage = /\.html?$/i.test(entry.path);
        const type = /\.pdf$/i.test(entry.path) ? "PDF" : isPage ? "saved registry page" : "image";
        let kind = `Application · ${type} · labels inside it`;
        if (isPage && labels.length === 0) {
          kind = "Application · saved registry page. Its label images weren't included. Add its _files folder, or save the page as \"Web Page, Complete\".";
        } else if (isPage) {
          kind = `Application · ${type} · ${labels.length} label image${labels.length === 1 ? "" : "s"}${
            missingLabels.length > 0 ? ` (${missingLabels.length} it links to weren't included)` : ""
          }`;
        }
        return (
          <div key={entry.id}>
            <Row entry={entry} kind={kind} warn={isPage && (labels.length === 0 || missingLabels.length > 0)} onRemove={() => onRemove(entry.id)} />
            {labels.map((label) => (
              <Row key={label.id} entry={label} indent kind="Label image, from the page above" />
            ))}
          </div>
        );
      })}
    </div>
  );
}
