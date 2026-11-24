import { describe, expect, it } from "vitest";
import { ASK_GENERATORS } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskScreenAdapter } from "@/lib/ask/askAdapter";
import { askFileStem, registryFrom } from "./useAskAdapters";

import { createApp, effectScope, h, type App } from "vue";
import { QueryClient, VueQueryPlugin, useQuery } from "@tanstack/vue-query";

type Loader<T> = () => Promise<{ default: () => T }>;
const adapter = (id: string, calls?: string[]): Loader<AskAdapter> => async () => {
  calls?.push(`import ${id}`);
  return { default: () => ({ id, quote: () => { throw new Error("unused"); }, run: async () => { throw new Error("unused"); } }) };
};
const screen = (id: string): Loader<AskScreenAdapter> => async () => ({ default: () => ({ id }) as AskScreenAdapter });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("registryFrom", () => {
  it("finds an adapter or a screen by its id once it has loaded, and offers nothing for an id with neither", async () => {
    const registry = registryFrom({ "./adapters/npcAskAdapter.ts": adapter("npc") }, { "./screens/mapStyleAskScreen.ts": screen("map_style") });
    expect((await registry.loadAdapter("npc"))?.id).toBe("npc");
    expect(registry.adapterFor("npc")?.id).toBe("npc");
    registry.screenFor("map_style");
    await flush();
    expect(registry.screenFor("map_style")?.id).toBe("map_style");
    expect(await registry.loadAdapter("item")).toBeUndefined();
    expect(registry.hasAdapter("item")).toBe(false);
    expect(registry.screenFor("npc")).toBeUndefined();
  });

  it("imports nothing until a card asks, then only that card's file, once", async () => {
    const calls: string[] = [];
    const registry = registryFrom(
      { "./adapters/npcAskAdapter.ts": adapter("npc", calls), "./adapters/itemAskAdapter.ts": adapter("item", calls) },
      {},
    );
    expect(calls).toEqual([]);
    expect(registry.adapterFor("npc")).toBeUndefined();
    registry.adapterFor("npc");
    await flush();
    expect(calls).toEqual(["import npc"]);
    expect(registry.adapterFor("npc")?.id).toBe("npc");
  });

  it("says a generator is known while its file is still loading, so the card waits instead of refusing", async () => {
    const registry = registryFrom({ "./adapters/npcAskAdapter.ts": adapter("npc") }, {});
    expect(registry.adapterFor("npc")).toBeUndefined();
    expect(registry.hasAdapter("npc")).toBe(true);
    await flush();
    expect(registry.adapterFor("npc")).toBeDefined();
  });

  it("treats a file that will not load as 'cannot run from here', and does not retry it on every read", async () => {
    let tries = 0;
    const registry = registryFrom({ "./adapters/npcAskAdapter.ts": async () => { tries += 1; throw new Error("offline"); } }, {});
    expect(await registry.loadAdapter("npc")).toBeUndefined();
    registry.adapterFor("npc");
    registry.adapterFor("npc");
    await flush();
    expect(registry.hasAdapter("npc")).toBe(false);
    expect(tries).toBe(1);
  });

  it("refuses a file whose adapter answers to another id instead of serving the wrong one", async () => {
    const registry = registryFrom({ "./adapters/npcAskAdapter.ts": adapter("item") }, {});
    expect(await registry.loadAdapter("npc")).toBeUndefined();
    expect(registry.hasAdapter("npc")).toBe(false);
  });

  it("makes an adapter through the panel's own context, so its queries work when it is made later", async () => {
    const client = new QueryClient();
    const panelScope = effectScope();
    const queryAdapter: Loader<AskAdapter> = async () => ({
      default: () => {
        const q = useQuery({ queryKey: ["ask-lazy"], queryFn: async () => "fetched" });
        return { id: "npc", quote: () => { throw new Error(String(q.data.value)); }, run: async () => { throw new Error("unused"); }, q } as AskAdapter;
      },
    });
    const app: App = createApp({ render: () => h("div") }).use(VueQueryPlugin, { queryClient: client });
    // The same capture useAskAdapters makes in setup, with the adapter file swapped for one that calls useQuery.
    const make = <T,>(factory: () => T): T => app.runWithContext(() => panelScope.run(factory) as T);
    const registry = registryFrom({ "./adapters/npcAskAdapter.ts": queryAdapter }, {}, make);
    const made = await registry.loadAdapter("npc");
    await flush();
    await flush();
    expect(made).toBeDefined();
    expect(client.getQueryData(["ask-lazy"])).toBe("fetched");
  });
});

// Lazy: only the file names are read, so no adapter runs and none needs a Pinia or a query client.
const adapterFiles = Object.keys(import.meta.glob("./adapters/*AskAdapter.ts")).map((p) => p.replace("./adapters/", ""));
const screenFiles = Object.keys(import.meta.glob("./screens/*AskScreen.ts")).map((p) => p.replace("./screens/", ""));

describe("every generator the model may propose can be run from Ask", () => {
  it("turns an id into the file stem the registry convention expects", () => {
    expect(askFileStem("music_track")).toBe("musicTrack");
    expect(askFileStem("npc")).toBe("npc");
    expect(askFileStem("connection_suggestions")).toBe("connectionSuggestions");
  });

  it.each(ASK_GENERATORS.map((g) => [g.id, g.ending] as const))("%s (%s) has exactly one file of the right kind and none of the other", (id, ending) => {
    const stem = askFileStem(id);
    const adapters = adapterFiles.filter((f) => f === `${stem}AskAdapter.ts`);
    const screens = screenFiles.filter((f) => f === `${stem}AskScreen.ts`);
    if (ending === "screen") {
      expect({ adapters: adapters.length, screens: screens.length }).toEqual({ adapters: 0, screens: 1 });
    } else {
      expect({ adapters: adapters.length, screens: screens.length }).toEqual({ adapters: 1, screens: 0 });
    }
  });

  it("has no adapter or screen file for a generator the contract does not list", () => {
    const stems = new Set(ASK_GENERATORS.map((g) => askFileStem(g.id)));
    const stray = [
      ...adapterFiles.filter((f) => !stems.has(f.replace(/AskAdapter\.ts$/, ""))),
      ...screenFiles.filter((f) => !stems.has(f.replace(/AskScreen\.ts$/, ""))),
    ];
    expect(stray).toEqual([]);
  });
});
