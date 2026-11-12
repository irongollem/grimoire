/*
 * Runs the brush importer off the page's thread (#1181): a 50 MB file would otherwise freeze the painting
 * workbench while it inflates. The importer is pure, so it runs here as it is; the pictures go back as
 * transferred buffers rather than copies. A failure goes back as an error reply, never as silence.
 */
import { importBrushes } from "../import/importBrushes";
import type { ImportResult } from "../import/types";
import { transferBuffers } from "./transferBuffers";

export interface ImportRequest {
  name: string;
  bytes: Uint8Array;
}
export type ImportReply = { ok: true; result: ImportResult } | { ok: false; message: string };

const fail = (e: unknown) => {
  const reply: ImportReply = { ok: false, message: e instanceof Error ? e.message : "The file could not be read." };
  self.postMessage(reply);
};

self.onmessage = (ev: MessageEvent<ImportRequest>) => {
  importBrushes(ev.data)
    .then((result: ImportResult) => {
      const reply: ImportReply = { ok: true, result };
      self.postMessage(reply, { transfer: transferBuffers(result) });
    })
    .catch(fail);
};
