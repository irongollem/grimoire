import { describe, expect, it } from "vitest";
import { ASK_GENERATORS } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskScreenAdapter } from "@/lib/ask/askAdapter";
import { askFileStem, registryFrom } from "./useAskAdapters";

const adapter = (id: string): { default: () => AskAdapter } => ({ default: () => ({ id, quote: () => { throw new Error("unused"); }, run: async () => { throw new Error("unused"); } }) });
const screen = (id: string): { default: () => AskScreenAdapter } => ({ default: () => ({ id }) as AskScreenAdapter });

describe("registryFrom", () => {
  it("finds an adapter or a screen by its id, and offers nothing for an id with neither", () => {
    const registry = registryFrom({ "./adapters/npcAskAdapter.ts": adapter("npc") }, { "./screens/mapStyleAskScreen.ts": screen("map_style") });
    expect(registry.adapterFor("npc")?.id).toBe("npc");
    expect(registry.screenFor("map_style")?.id).toBe("map_style");
    expect(registry.adapterFor("item")).toBeUndefined();
    expect(registry.screenFor("npc")).toBeUndefined();
  });

  it("refuses two adapters that claim one id instead of letting the later file win quietly", () => {
    expect(() => registryFrom({ "./adapters/aAskAdapter.ts": adapter("npc"), "./adapters/bAskAdapter.ts": adapter("npc") }, {})).toThrow(/"npc"/);
  });

  it("refuses two screens that claim one id", () => {
    expect(() => registryFrom({}, { "./screens/aAskScreen.ts": screen("x"), "./screens/bAskScreen.ts": screen("x") })).toThrow(/"x"/);
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
