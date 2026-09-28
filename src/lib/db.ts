import { neon } from "@neondatabase/serverless";
import type { VerificationRecord, VerificationResult } from "./types";
import { worstVerdict } from "./verdict";

function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return neon(process.env.DATABASE_URL);
}

let schemaReady: Promise<unknown> | null = null;
function ensureSchema() {
  schemaReady ??= sql()`
    CREATE TABLE IF NOT EXISTS verification_runs (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      overall_verdict TEXT NOT NULL,
      results JSONB NOT NULL
    )
  `.catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** Saves one request's results as a history record. */
export async function logVerification(results: VerificationResult[]) {
  await ensureSchema();
  const overall = worstVerdict(results.map((r) => r.overallVerdict));
  await sql()`
    INSERT INTO verification_runs (overall_verdict, results)
    VALUES (${overall}, ${JSON.stringify(results)})
  `;
}

export async function getAllVerifications(): Promise<VerificationRecord[]> {
  await ensureSchema();
  const rows = await sql()`
    SELECT id, created_at, overall_verdict, results FROM verification_runs ORDER BY created_at DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    overallVerdict: r.overall_verdict,
    results: r.results,
  })) as VerificationRecord[];
}
