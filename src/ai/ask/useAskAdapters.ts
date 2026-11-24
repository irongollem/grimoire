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
import type { AnyAskAdapter, AskScreenAdapter } from "@/lib/ask/askAdapter";

const adapterModules = import.meta.glob<{ default: () => AnyAskAdapter }>("./adapters/*AskAdapter.ts", { eager: true });
const screenModules = import.meta.glob<{ default: () => AskScreenAdapter }>("./screens/*AskScreen.ts", { eager: true });

export interface AskAdapters {
  adapterFor(id: string): AnyAskAdapter | undefined;
  screenFor(id: string): AskScreenAdapter | undefined;
}

/** A generator id as its file stem: `music_track` is `musicTrack`, so its adapter is `musicTrackAskAdapter.ts`. */
export function askFileStem(id: string): string {
  return id.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Every module made into its adapter, keyed by id. Two files claiming one id is a mistake, never a silent overwrite. */
function byId<T extends { id: string }>(modules: Record<string, { default: () => T }>, kind: string): Map<string, T> {
  const found = new Map<string, T>();
  for (const [path, module] of Object.entries(modules)) {
    const made = module.default();
    if (found.has(made.id)) throw new Error(`Two ${kind} files answer to the id "${made.id}" (the second is ${path}).`);
    found.set(made.id, made);
  }
  return found;
}

/**
 * The lookup the panel uses, from the glob's modules. Pure so it can be tested with fake modules; the glob itself
 * is only the file system. Calls each module's composable, so call it in the panel's setup.
 */
export function registryFrom(
  adapterMods: Record<string, { default: () => AnyAskAdapter }>,
  screenMods: Record<string, { default: () => AskScreenAdapter }>,
): AskAdapters {
  const adapters = byId(adapterMods, "adapter");
  const screens = byId(screenMods, "screen");
  return {
    adapterFor: (id) => adapters.get(id),
    screenFor: (id) => screens.get(id),
  };
}

export function useAskAdapters(): AskAdapters {
  // Called here, in the panel's setup, so every adapter shares the panel's scope.
  return registryFrom(adapterModules, screenModules);
}
