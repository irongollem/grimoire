import type { ImportResult } from "../import/types";
import type { ImportReply } from "./importBrushesWorker";

/** The slice of a Worker the wrapper uses, so a test can stand one in. */
export interface ImportWorker {
  onmessage: ((ev: MessageEvent<ImportReply>) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  postMessage(message: unknown, options?: { transfer: Transferable[] }): void;
  terminate(): void;
}

const browserWorker = (): ImportWorker => new Worker(new URL("./importBrushesWorker.ts", import.meta.url), { type: "module" }) as unknown as ImportWorker;

/** Reads a brush file in a worker and resolves with what it held. Rejects when the worker fails or dies. */
export function runImport(name: string, bytes: Uint8Array, makeWorker: () => ImportWorker = browserWorker): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const worker = makeWorker();
    worker.onmessage = (ev) => {
      worker.terminate();
      if (ev.data.ok) resolve(ev.data.result);
      else reject(new Error(ev.data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("The file could not be read."));
    };
    worker.postMessage({ name, bytes }, { transfer: [bytes.buffer] });
  });
}
