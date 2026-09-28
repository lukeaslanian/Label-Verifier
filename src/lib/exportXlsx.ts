import ExcelJS from "exceljs";
import type { VerificationRecord, VerificationResult } from "./types";

const FIELDS = [
  ["brandName", "Brand Name"],
  ["classType", "Class/Type"],
  ["alcoholContent", "Alcohol Content"],
  ["netContents", "Net Contents"],
  ["governmentWarning", "Government Warning"],
] as const;

function resultToRow(result: VerificationResult, runDate?: string): Record<string, string> {
  const row: Record<string, string> = {};
  if (runDate) row["Run Date"] = runDate;
  row["Application"] = result.applicationFilename;
  row["Label"] = result.labelFilenames.join(", ") || "(inside application)";
  row["Overall Verdict"] = result.overallVerdict;
  // What the label said as well as the verdict, so a reviewer can see what
  // a passing label actually said, not just that it passed.
  for (const [key, header] of FIELDS) {
    const field = result.fields.find((f) => f.field === key);
    row[`${header} (Application)`] = field?.expected ?? "";
    row[`${header} (Label)`] = field?.found ?? "";
    row[`${header} Verdict`] = field?.verdict ?? "";
    row[`${header} Note`] = field?.note ?? "";
  }
  row["Error"] = result.error ?? "";
  row["Read By"] = result.readBy.join(" + ");
  row["Time (s)"] = (result.elapsedMs / 1000).toFixed(1);
  return row;
}

async function downloadWorkbook(rows: Record<string, string>[], filename: string) {
  if (rows.length === 0) return;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Results");
  sheet.columns = Object.keys(rows[0]).map((h) => ({ header: h, key: h, width: 22 }));
  sheet.addRows(rows);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRunToXlsx(results: VerificationResult[]) {
  return downloadWorkbook(results.map((r) => resultToRow(r)), "label-verification-run.xlsx");
}

export function exportHistoryToXlsx(records: VerificationRecord[]) {
  const rows = records.flatMap((record) =>
    record.results.map((result) => resultToRow(result, new Date(record.createdAt).toLocaleString()))
  );
  return downloadWorkbook(rows, "label-verification-history.xlsx");
}
