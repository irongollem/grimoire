import { describe, it, expect } from "vitest";
import {
  itemInsertFromSeed,
  noteInsertFromSeed,
  npcInsertFromSeed,
} from "@/lib/downtimeSeedReward";
import { DOWNTIME_ACTIVITIES } from "@/data/downtimeActivities";
import { DOWNTIME_SEEDS, seedsForActivity } from "@/data/downtimeSeeds";
import type {
  DowntimeSeedItem,
  DowntimeSeedNote,
  DowntimeSeedNpc,
} from "@/types/downtime.types";

const npc: DowntimeSeedNpc = {
  name: "Sela",
  race: "Half-elf",
  alignment: "Neutral",
  occupation: "Fence",
  appearance: "Wiry",
  personality: "Speaks in prices",
  backstory: "Moves stolen goods",
  relationship: "indifferent",
  tags: ["underworld"],
  portrait_url: null,
};

const item: DowntimeSeedItem = {
  name: "Well-Forged Blade",
  item_type: "weapon",
  subtype: "longsword",
  rarity: "common",
  requires_attunement: false,
  weight: 3,
  cost: "15 gp",
  description: "Honest steel.",
  tags: ["crafted"],
  image_url: null,
};

const note: DowntimeSeedNote = {
  title: "A thread worth pulling",
  body: "Some **lore** you turned up.",
  category: "lore",
  tags: ["research"],
};

describe("npcInsertFromSeed", () => {
  it("carries the seed's character fields", () => {
    const out = npcInsertFromSeed(npc);
    expect(out.name).toBe("Sela");
    expect(out.occupation).toBe("Fence");
    expect(out.tags).toEqual(["underworld"]);
  });

  it("hides the contact from players by default", () => {
    expect(npcInsertFromSeed(npc).player_visible_to).toEqual([]);
    expect(npcInsertFromSeed(npc).is_revealed).toBe(true);
  });

  it("copies tags rather than aliasing the seed array", () => {
    const out = npcInsertFromSeed(npc);
    expect(out.tags).not.toBe(npc.tags);
  });
});

describe("itemInsertFromSeed", () => {
  it("carries the seed's item fields and defaults the rest to mundane", () => {
    const out = itemInsertFromSeed(item);
    expect(out.name).toBe("Well-Forged Blade");
    expect(out.item_type).toBe("weapon");
    expect(out.rarity).toBe("common");
    expect(out.damage_rolls).toBeNull();
    expect(out.properties).toEqual([]);
    expect(out.is_arcane_focus).toBe(false);
    expect(out.curse_description).toBeNull();
  });

  it("copies tags rather than aliasing the seed array", () => {
    expect(itemInsertFromSeed(item).tags).not.toBe(item.tags);
  });
});

describe("noteInsertFromSeed", () => {
  it("carries title, category, and tags", () => {
    const out = noteInsertFromSeed(note);
    expect(out.title).toBe("A thread worth pulling");
    expect(out.category).toBe("lore");
    expect(out.tags).toEqual(["research"]);
  });

  it("converts the Markdown body to a Tiptap JSON document string", () => {
    const content = noteInsertFromSeed(note).content;
    expect(typeof content).toBe("string");
    const doc = JSON.parse(content!);
    expect(doc.type).toBe("doc");
  });

  it("hides the note from players by default", () => {
    expect(noteInsertFromSeed(note).player_visible_to).toEqual([]);
  });
});

// ── Data invariants: the deck's catalog + seeds must stay internally consistent ──

describe("downtime deck data", () => {
  it("every seed has a positive weight", () => {
    for (const seed of DOWNTIME_SEEDS) {
      expect(seed.weight, seed.id).toBeGreaterThan(0);
    }
  });

  it("every seed's activityKey names a real archetype", () => {
    const keys = new Set(DOWNTIME_ACTIVITIES.map((a) => a.key));
    for (const seed of DOWNTIME_SEEDS) {
      expect(keys.has(seed.activityKey), seed.id).toBe(true);
    }
  });

  it("every archetype has at least one seed to fall back on", () => {
    for (const activity of DOWNTIME_ACTIVITIES) {
      expect(seedsForActivity(activity.key).length, activity.key).toBeGreaterThan(0);
    }
  });

  it("each seed's reward kind matches its archetype's advertised rewardType", () => {
    const rewardTypeByKey = new Map(DOWNTIME_ACTIVITIES.map((a) => [a.key, a.rewardType]));
    for (const seed of DOWNTIME_SEEDS) {
      expect(seed.reward.kind, seed.id).toBe(rewardTypeByKey.get(seed.activityKey));
    }
  });

  it("only ever builds reward kinds that have a builder (npc/item/note)", () => {
    const buildable = new Set(["npc", "item", "note"]);
    for (const seed of DOWNTIME_SEEDS) {
      expect(buildable.has(seed.reward.kind), seed.id).toBe(true);
    }
  });

  it("has no duplicate seed ids", () => {
    const ids = DOWNTIME_SEEDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
