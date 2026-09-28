/**
 * Real TTB COLA filings, all from the public COLA registry, in the three
 * formats they come in. Files live in public/samples/<id>/, laid out exactly
 * as they're downloaded, so a saved registry page keeps its "_files" folder.
 */
export type SampleFormat = "scan" | "pdf" | "registry";

export interface Sample {
  id: string;
  name: string;
  format: SampleFormat;
  /** Paths under /samples/<id>/. */
  files: string[];
}

export const SAMPLE_FORMATS: Record<SampleFormat, string> = {
  scan: "Scanned paper filings (form and label in one image)",
  pdf: "Registry pages saved as PDF (form and labels in one file)",
  registry: "Saved registry pages (the page plus its _files folder)",
};

const single = (id: string, name: string, format: "scan" | "pdf"): Sample => ({
  id,
  name,
  format,
  files: [`application.${format === "scan" ? "jpg" : "pdf"}`],
});

const page = (id: string, name: string, pageName: string, attachments: string[]): Sample => ({
  id,
  name,
  format: "registry",
  files: [`${pageName}.html`, ...attachments.map((a) => `${pageName}_files/publicViewAttachment${a}.jpg`)],
});

export const SAMPLES: Sample[] = [
  single("bienvenida", "Bienvenida (wine)", "scan"),
  single("coors-light", "Coors Light (beer)", "scan"),
  single("deutz", "Deutz Champagne (wine)", "scan"),
  single("highland", "Highland Cold Mountain Winter Ale (beer)", "scan"),
  single("king-george", "King George IV (Scotch whisky)", "scan"),
  single("georgia", "Still Pond Crimson Clover (wine, label printed sideways)", "scan"),
  single("cies", "Cies (wine)", "pdf"),
  single("guinness", "Guinness (beer)", "pdf"),
  single("panther", "Panther (malt beverage)", "pdf"),
  single("rhumbero", "Rhumbero (flavored wine)", "pdf"),
  single("eaglemount", "Eaglemount (fruit wine)", "pdf"),
  single("prinsi-barbera", "Prinsi Barbera d'Alba (wine)", "pdf"),
  single("pinagolada", "Cordina Piña-Go-Lada (flavored wine)", "pdf"),
  page("chaglasian", "Chaglasian Areni (wine)", "areni", ["_002_RgFK", "_RgFK"]),
  page("barenjager", "Bärenjäger Honey & Tea (liqueur)", "barenjager", ["_003_DQ1y", "_DQ1y", "_005_DQ1y", "_004_DQ1y", "_002_DQ1y"]),
  page("bindi-sergardi", "Bindi Sergardi (wine)", "bindi serg", ["_3fPJ", "_002_3fPJ", "_003_3fPJ"]),
  page("cascade-winery", "Cascade Winery (wine)", "cascade val", ["_rSMK"]),
  page("fuerza-uno", "Fuerza Uno (spirits)", "fuerza", ["_002_3a4z", "_3a4z"]),
  page("lenz-moser", "Lenz Moser Fete (wine)", "Lenz Mober", ["_002_pAEP", "_pAEP"]),
  page("prinsi", "Prinsi (wine)", "prinsi", ["_002_1E1z", "_1E1z", "_003_1E1z"]),
];
