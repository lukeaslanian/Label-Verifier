"use client";

import { useState } from "react";
import { FlaskIcon } from "@phosphor-icons/react";
import type { VerificationResult } from "@/lib/types";
import { SAMPLES, SAMPLE_FORMATS, type SampleFormat } from "@/lib/sampleFiles";
import { exportHistoryToXlsx } from "@/lib/exportXlsx";
import { DropArea, type DroppedFile } from "./DropArea";
import { FileList } from "./FileList";
import { Results, type ResultRow } from "./Results";
import { useFileIntake } from "./useFileIntake";

// Applications checked at once. Each is its own request, so every result
// shows up the moment it's ready instead of waiting on the slowest one, and
// no request comes near the server's time limit.
const CONCURRENT = 6;

async function fetchSample(path: string): Promise<DroppedFile> {
  const res = await fetch(`/samples/${encodeURI(path)}`);
  if (!res.ok) throw new Error(`Couldn't load sample ${path}`);
  const blob = await res.blob();
  return { file: new File([blob], path, { type: blob.type }), path };
}

export function Verifier({ historyEnabled }: { historyEnabled: boolean }) {
  const intake = useFileIntake();
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { applications } = intake;
  const running = rows !== null && rows.some((r) => !r.result);
  const pageWithoutLabels = applications.some((a) => /\.html?$/i.test(a.entry.path) && a.labels.length === 0);
  const ready = applications.length > 0 && !pageWithoutLabels && !running;

  async function loadSamples(ids: string[]) {
    setError(null);
    try {
      const chosen = SAMPLES.filter((s) => ids.includes(s.id));
      await intake.add(await Promise.all(chosen.flatMap((s) => s.files.map((f) => fetchSample(`${s.id}/${f}`)))));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the samples.");
    }
  }

  async function verify() {
    if (!ready) return;
    const batch = applications.map((a) => ({ application: a.entry, labelFiles: a.labels.map((l) => l.file) }));
    intake.clear();
    setRows(
      batch.map(({ application, labelFiles }) => ({
        applicationFilename: application.path,
        labelFilenames: labelFiles.map((f) => f.name),
        result: null,
      }))
    );

    const check = async (i: number) => {
      const { application, labelFiles } = batch[i];
      const formData = new FormData();
      formData.append("applications", application.file);
      for (const label of labelFiles) {
        formData.append("labels", label);
        formData.append("labelFor", "0");
      }
      let result: VerificationResult;
      try {
        const res = await fetch("/api/verify", { method: "POST", body: formData });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error(data?.error ?? "The server couldn't check this one. Please try again.");
        result = data.results[0];
      } catch (err) {
        result = {
          applicationFilename: application.path,
          labelFilenames: labelFiles.map((f) => f.name),
          overallVerdict: "fail",
          fields: [],
          readBy: [],
          elapsedMs: 0,
          error: err instanceof Error ? err.message : "Something went wrong.",
        };
      }
      setRows((prev) => prev && prev.map((row, j) => (j === i ? { ...row, result } : row)));
    };

    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENT, batch.length) }, async () => {
        while (next < batch.length) await check(next++);
      })
    );
  }

  async function downloadHistory() {
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load history.");
      if (data.records.length === 0) setError("No saved results yet.");
      else await exportHistoryToXlsx(data.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setHistoryLoading(false);
    }
  }

  const formats = Object.keys(SAMPLE_FORMATS) as SampleFormat[];
  const buttonText = running
    ? "Checking..."
    : applications.length > 1
      ? `Verify ${applications.length} labels`
      : "Verify label";

  return (
    <div className="flex flex-col gap-8">
      {!rows && (
        <div className="card">
          <DropArea onFiles={intake.add} />

          {applications.length > 0 && <FileList applications={applications} onRemove={intake.remove} />}

          {error && <p className="text-alert">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn btn-ghost relative">
                <FlaskIcon size={20} weight="duotone" aria-hidden />
                Use sample files
                <select
                  value=""
                  aria-label="Use sample files"
                  onChange={(e) => {
                    const value = e.target.value;
                    e.target.value = "";
                    loadSamples(value === "all" ? SAMPLES.map((s) => s.id) : [value]);
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="" disabled>
                    Use sample files
                  </option>
                  <option value="all">All {SAMPLES.length} real samples</option>
                  {formats.map((format) => (
                    <optgroup key={format} label={SAMPLE_FORMATS[format]}>
                      {SAMPLES.filter((s) => s.format === format).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {applications.length > 0 && (
                <button className="btn btn-ghost" onClick={intake.clear}>
                  Clear all
                </button>
              )}
            </div>
            <button className="btn btn-primary" disabled={!ready} onClick={verify}>
              {buttonText}
            </button>
          </div>
        </div>
      )}

      {rows && <Results rows={rows} onStartOver={() => setRows(null)} />}

      {historyEnabled && (
        <button className="btn btn-ghost self-start" disabled={historyLoading} onClick={downloadHistory}>
          {historyLoading ? "Loading..." : "Download all past results (XLSX)"}
        </button>
      )}
    </div>
  );
}
