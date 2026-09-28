import type { ProcessedUpload } from "../imagePrep";
import { buildLabelPrompt, parseLabelResponse, type LabelReading } from "./labelPrompt";
import { visionModels } from "./providers";

export interface LabelReadingResult extends LabelReading {
  /** Model name, used in notes and shown to the user. */
  readBy: string;
}

export interface LabelReader {
  name: string;
  read: (uploads: ProcessedUpload[], labelIsInsideApplication: boolean) => Promise<LabelReadingResult>;
}

/** Every available model as a label reader, in the order they're asked
 * (see visionModels). All images of one label go in a single call. */
export function labelReaders(): LabelReader[] {
  return visionModels().map((model) => ({
    name: model.name,
    read: async (uploads, embedded) => ({
      // A high limit, because a real label with a lot of text was once cut off
      // at 1024 tokens before the warning, which looked like no warning.
      ...parseLabelResponse(await model.ask(buildLabelPrompt(embedded), uploads, 4096)),
      readBy: model.name,
    }),
  }));
}
