/**
 * The heavy half of a setting, one lazily fetched chunk each.
 *
 * Every built-in setting is 20-33 kB of seed text, and the nine together were
 * 99 kB encoded in the entry's neighbourhood for every dashboard and player
 * portal load (#999). Only the populate buttons and the AI prompt default read
 * it, so each setting is its own dynamic import and a page downloads at most
 * the active campaign's. The light half (id, label, calendar) stays in
 * `./index`; do not import this module's loaders from there.
 */

import type { SettingContentDef } from "./types";

const LOADERS: Record<string, () => Promise<SettingContentDef>> = {
  faerun: () => import("./faerun").then((m) => m.faerunContent),
  eberron: () => import("./eberron").then((m) => m.eberronContent),
  greyhawk: () => import("./greyhawk").then((m) => m.greyhawkContent),
  dragonlance: () => import("./dragonlance").then((m) => m.dragonlanceContent),
  ravenloft: () => import("./ravenloft").then((m) => m.ravenloftContent),
  planescape: () => import("./planescape").then((m) => m.planescapeContent),
  spelljammer: () => import("./spelljammer").then((m) => m.spelljammerContent),
  darksun: () => import("./darksun").then((m) => m.darksunContent),
  mystara: () => import("./mystara").then((m) => m.mystaraContent),
};

const loaded = new Map<string, Promise<SettingContentDef>>();

/**
 * A setting's seed content, or null when the id is not a built-in (homebrew,
 * "custom", "gregorian"). Memoised per id; a failed import is forgotten so a
 * retry can succeed after a flaky chunk fetch.
 */
export function loadSettingContent(id: string): Promise<SettingContentDef | null> {
  const load = LOADERS[id];
  if (!load) return Promise.resolve(null);
  const cached = loaded.get(id);
  if (cached) return cached;
  const pending = load().catch((e: unknown) => {
    loaded.delete(id);
    throw e;
  });
  loaded.set(id, pending);
  return pending;
}
