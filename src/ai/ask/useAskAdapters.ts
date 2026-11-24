/**
 * Ask Grimoire (#1253): every generator's adapter, keyed by its `ASK_GENERATORS` id.
 *
 * Each adapter is its own file and is found here by name, so adding a generator never edits this file:
 * `adapters/<name>AskAdapter.ts` default-exports a composable returning an `AskAdapter`, and
 * `screens/<name>AskScreen.ts` default-exports one returning an `AskScreenAdapter`.
 *
 * Adapters load on demand (#1270): an adapter pulls its generator's whole workflow, so importing them all made the
 * panel ~1.3 MB and pressing one Generate button loaded every generator. A card asks for its own id, the file is
 * imported the first time, and the composable is made inside the panel's scope and app context (so `inject`, the
 * query client and Pinia work, and its effects live as long as the panel). `adapterFor` stays a plain read the
 * card's computeds can make: it is `undefined` until the file arrives, then the reactive map fills in.
 */
import { getCurrentInstance, getCurrentScope, shallowReactive } from "vue";
import type { AnyAskAdapter, AskScreenAdapter } from "@/lib/ask/askAdapter";

type ModuleImport<T> = () => Promise<{ default: () => T }>;

const adapterLoaders: Record<string, ModuleImport<AnyAskAdapter>> = import.meta.glob<{ default: () => AnyAskAdapter }>("./adapters/*AskAdapter.ts");
const screenLoaders: Record<string, ModuleImport<AskScreenAdapter>> = import.meta.glob<{ default: () => AskScreenAdapter }>("./screens/*AskScreen.ts");

export interface AskAdapters {
  /** The generator's adapter once loaded, else `undefined`; the first read starts the load, and the read is reactive. */
  adapterFor(id: string): AnyAskAdapter | undefined;
  /** Whether this generator has an adapter file that has not failed to load: false means "cannot run from here". */
  hasAdapter(id: string): boolean;
  /** Resolves with the adapter once it is made, or `undefined` when there is none (or its file would not load). */
  loadAdapter(id: string): Promise<AnyAskAdapter | undefined>;
  screenFor(id: string): AskScreenAdapter | undefined;
}

/** A generator id as its file stem: `music_track` is `musicTrack`, so its adapter is `musicTrackAskAdapter.ts`. */
export function askFileStem(id: string): string {
  return id.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Makes a composable's value where the panel's setup would have: inside its scope and app. */
type Make = <T>(factory: () => T) => T;

/** One lazily filled lookup over a glob's loaders: the file name carries the id, the made value must agree with it. */
function lazyById<T extends { id: string }>(loaders: Record<string, ModuleImport<T>>, suffix: string, kind: string, make: Make) {
  const made = shallowReactive(new Map<string, T>());
  const pending = new Map<string, Promise<T | undefined>>();
  const failed = new Set<string>();

  const loaderFor = (id: string): ModuleImport<T> | undefined => loaders[`./${kind}s/${askFileStem(id)}${suffix}.ts`];

  function load(id: string): Promise<T | undefined> {
    const have = made.get(id);
    if (have) return Promise.resolve(have);
    const loader = loaderFor(id);
    if (!loader || failed.has(id)) return Promise.resolve(undefined);
    let started = pending.get(id);
    if (!started) {
      started = loader().then(
        (module) => {
          const value = make(module.default);
          if (value.id !== id) throw new Error(`The ${kind} file for "${id}" answers to the id "${value.id}".`);
          made.set(id, value);
          return value;
        },
      ).catch(() => {
        // A chunk that would not load (offline, a stale deploy) is "cannot run from here", not a retry on every read.
        failed.add(id);
        return undefined;
      });
      pending.set(id, started);
    }
    return started;
  }

  return {
    get(id: string): T | undefined {
      const have = made.get(id);
      if (!have) void load(id);
      return have;
    },
    has: (id: string) => loaderFor(id) !== undefined && !failed.has(id),
    load,
  };
}

/**
 * The lookup the panel uses, from the glob's loaders. `make` runs each adapter's composable; it is a parameter so the
 * panel can pass its scope and app, and a test can pass fake loaders.
 */
export function registryFrom(
  adapterMods: Record<string, ModuleImport<AnyAskAdapter>>,
  screenMods: Record<string, ModuleImport<AskScreenAdapter>>,
  make: Make = (factory) => factory(),
): AskAdapters {
  const adapters = lazyById(adapterMods, "AskAdapter", "adapter", make);
  const screens = lazyById(screenMods, "AskScreen", "screen", make);
  return {
    adapterFor: adapters.get,
    hasAdapter: adapters.has,
    loadAdapter: adapters.load,
    screenFor: screens.get,
  };
}

export function useAskAdapters(): AskAdapters {
  // Captured here, in the panel's setup: an adapter made later (when its card appears) is made as if it were made now.
  const scope = getCurrentScope();
  const app = getCurrentInstance()?.appContext.app;
  const make: Make = <T,>(factory: () => T): T => {
    const inScope = (): T => {
      if (!scope) return factory();
      const value = scope.run(factory);
      if (value === undefined) throw new Error("The Ask panel's scope has ended.");
      return value;
    };
    return app ? app.runWithContext(inScope) : inScope();
  };
  return registryFrom(adapterLoaders, screenLoaders, make);
}
