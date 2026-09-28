import { NextRequest, NextResponse } from "next/server";
import { verifyWithApplication } from "@/lib/verifyWithApplication";
import { logVerification } from "@/lib/db";
import { toProcessableUpload } from "@/lib/imagePrep";
import type { VerificationResult } from "@/lib/types";

// Most applications take ~2s, but one that needs a second opinion or is a
// full-page scan can take 20s+, well over Vercel's 10s default.
export const maxDuration = 60;

// Several applications in one request are checked a few at a time, since
// all at once would hit the vision APIs' rate limits.
const CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Form fields:
 * - `applications`: one file per COLA application (image, PDF, or saved registry HTML page)
 * - `labels`: label image/PDF files, in any number per application (front, back, neck...)
 * - `labelFor`: one entry per `labels` file, the index of the application it belongs to
 *
 * An application with no label files has its label read from inside the
 * application document itself.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const applications = formData.getAll("applications").filter((v): v is File => v instanceof File);
  const labels = formData.getAll("labels").filter((v): v is File => v instanceof File);
  const labelFor = formData.getAll("labelFor").map((v) => Number(v));

  if (applications.length === 0) {
    return NextResponse.json({ error: "Add at least one application file." }, { status: 400 });
  }
  if (labelFor.length !== labels.length || labelFor.some((i) => !Number.isInteger(i) || i < 0 || i >= applications.length)) {
    return NextResponse.json({ error: "Every label file must be matched to one of the application files." }, { status: 400 });
  }

  const results: VerificationResult[] = await mapWithConcurrency(
    applications.map((application, i) => ({ application, labelFiles: labels.filter((_, j) => labelFor[j] === i) })),
    CONCURRENCY,
    async ({ application, labelFiles }) => {
      const startedAt = Date.now();
      const labelFilenames = labelFiles.map((f) => f.name);
      try {
        const [applicationUpload, ...labelUploads] = await Promise.all(
          [application, ...labelFiles].map(async (f) =>
            toProcessableUpload(Buffer.from(await f.arrayBuffer()), f.name, f.type)
          )
        );
        if (labelUploads.some((u) => u.mimeType === "text/html")) {
          throw new Error("Label files must be images or PDFs, not web pages.");
        }
        return await verifyWithApplication(labelUploads, applicationUpload, labelFilenames, application.name);
      } catch (err) {
        console.error(`Verification failed for ${application.name}`, err);
        return {
          labelFilenames,
          applicationFilename: application.name,
          overallVerdict: "fail",
          fields: [],
          readBy: [],
          elapsedMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : "Verification failed.",
        } satisfies VerificationResult;
      }
    }
  );

  if (process.env.DATABASE_URL) {
    try {
      await logVerification(results);
    } catch (err) {
      console.error("Failed to save verification history", err);
    }
  }

  return NextResponse.json({ results });
}
