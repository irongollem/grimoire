/**
 * Ask Grimoire (#1253): every generator's adapter, keyed by its `ASK_GENERATORS` id.
 *
 * Call in the Ask panel's setup: each adapter is made by its generator's composable, so they share the panel's
 * scope. A generator with no adapter yet is not offered (the panel says it cannot run that one from here).
 */
import type { AskAdapter, AskScreenAdapter } from "@/lib/ask/askAdapter";

export interface AskAdapters {
  adapterFor(id: string): AskAdapter | undefined;
  screenFor(id: string): AskScreenAdapter | undefined;
}

export function useAskAdapters(): AskAdapters {
  const adapters = new Map<string, AskAdapter>();
  const screens = new Map<string, AskScreenAdapter>();
  return {
    adapterFor: (id) => adapters.get(id),
    screenFor: (id) => screens.get(id),
  };
}
