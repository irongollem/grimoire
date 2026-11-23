/**
 * Ask Grimoire (#1253): every generator's adapter, keyed by its `ASK_GENERATORS` id.
 *
 * Call in the Ask panel's setup: each adapter is made by its generator's composable, so they share the panel's
 * scope. A generator with no adapter yet is not offered (the panel says it cannot run that one from here).
 *
 * Each adapter is its own file and is found here by name, so adding a generator never edits this file:
 * `adapters/<name>AskAdapter.ts` default-exports a composable returning an `AskAdapter`, and
 * `screens/<name>AskScreen.ts` default-exports one returning an `AskScreenAdapter`.
 */
import type { AskAdapter, AskScreenAdapter } from "@/lib/ask/askAdapter";

const adapterModules = import.meta.glob<{ default: () => AskAdapter }>("./adapters/*AskAdapter.ts", { eager: true });
const screenModules = import.meta.glob<{ default: () => AskScreenAdapter }>("./screens/*AskScreen.ts", { eager: true });

export interface AskAdapters {
  adapterFor(id: string): AskAdapter | undefined;
  screenFor(id: string): AskScreenAdapter | undefined;
}

export function useAskAdapters(): AskAdapters {
  // Called here, in the panel's setup, so every adapter shares the panel's scope.
  const adapters = new Map<string, AskAdapter>(
    Object.values(adapterModules).map((m) => m.default()).map((adapter) => [adapter.id, adapter]),
  );
  const screens = new Map<string, AskScreenAdapter>(
    Object.values(screenModules).map((m) => m.default()).map((screen) => [screen.id, screen]),
  );
  return {
    adapterFor: (id) => adapters.get(id),
    screenFor: (id) => screens.get(id),
  };
}
