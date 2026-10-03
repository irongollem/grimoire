import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { isCdnBucket } from "../supabase/functions/_shared/cdn-buckets.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";
import { imageProvenanceStem } from "../supabase/functions/_shared/provenance/key.ts";
import {
  ITEM_RARITY_LABELS,
  ITEM_TYPE_LABELS,
  assertMayWrite,
  assertMaySpend,
  buildVariants,
  emptyManifest,
  encodeFinal,
  entrySlug,
  escapeLikePattern,
  itemContext,
  monsterContext,
  selectMonsterRowsToUpdate,
  newOriginalPath,
  parseCli,
  readManifest,
  readWebpProvenance,
  retryAfterMs,
  selectEntries,
  selectForPublish,
  itemNames,
  itemScene,
  itemSetting,
  itemStaging,
  ITEM_SCENES,
  selectItemRowsToUpdate,
  selectSpellRowsToUpdate,
  sniffIsWebp,
  spellContext,
  updateEntry,
  upsertEntry,
  variantPath,
  variantSize,
  writeManifest,
  BUCKET_FOR_KIND,
  type ManifestEntry,
} from "./generate-library-art.ts";

const prov: AiProvenance = {
  generatorType: "spell",
  provider: "openai",
  model: "gpt-image-2.5-flare",
  generatedAt: "2026-10-02T10:00:00.000Z",
  edited: false,
};

function entry(slug: string, status: ManifestEntry["status"] = "candidate"): ManifestEntry {
  return {
    slug, kind: "spell", id: "srd_fireball", name: "Fireball", alsoNames: [], context: "c", subject: "s", subjectSource: "model", imagePrompt: "p",
    provider: "openai", model: "m", textModel: "t", quality: "high", size: "1024x1536",
    generatedAt: prov.generatedAt, providerFile: `${slug}.provider.webp`, finalFile: `${slug}.webp`,
    providerBytes: 10, finalBytes: 5, imageUsage: null, status, publish: null,
  };
}

describe("context builders", () => {
  it("builds a spell context like SpellDetail's aiContext", () => {
    expect(spellContext({ name: "Fireball", level: 3, school: "evocation", description: "A bright streak flashes." })).toBe(
      "Fireball. level 3 evocation spell. A bright streak flashes.",
    );
    expect(spellContext({ name: "Light", level: 0, school: "evocation", description: "" })).toBe("Light. cantrip evocation spell");
  });

  it("flattens a Tiptap description", () => {
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }, { type: "text", text: "two" }] }] });
    expect(spellContext({ name: "X", level: 1, school: "illusion", description: doc })).toBe("X. level 1 illusion spell. One two");
  });

  it("builds an item context like ItemDetail's aiContext, with labels", () => {
    expect(itemContext({ name: "Bag of Holding", item_type: "wondrous_item", rarity: "uncommon", description: "Roomy." })).toBe(
      "Bag of Holding. Wondrous Item. Uncommon. Roomy.",
    );
    expect(ITEM_TYPE_LABELS.gear).toBe("Adventuring Gear");
    expect(ITEM_RARITY_LABELS.very_rare).toBe("Very Rare");
  });

  it("builds a monster context like MonsterDetail's aiContext", () => {
    expect(monsterContext({ name: "Sprite", size: "tiny", monster_type: "fey", alignment: "neutral good", habitat: null })).toBe(
      "Sprite. tiny fey. neutral good",
    );
    expect(monsterContext({ name: "Owlbear", size: "large", monster_type: "monstrosity", alignment: "unaligned", habitat: "forest" })).toBe(
      "Owlbear. large monstrosity. unaligned. forest",
    );
  });

  it("clamps to 2000 characters", () => {
    expect(spellContext({ name: "X", level: 1, school: "illusion", description: "a".repeat(5000) })).toHaveLength(2000);
  });
});

describe("item staging", () => {
  it("stands long things upright, armor on a stand, and lays the rest down", () => {
    expect(itemStaging({ name: "Staff of Frost", item_type: "staff" })).toBe("upright");
    expect(itemStaging({ name: "Rod of Lordly Might", item_type: "rod" })).toBe("upright");
    expect(itemStaging({ name: "Pike", item_type: "weapon" })).toBe("upright");
    expect(itemStaging({ name: "Holy Avenger", item_type: "weapon" })).toBe("upright");
    expect(itemStaging({ name: "Longsword (+1)", item_type: "weapon" })).toBe("upright");
    expect(itemStaging({ name: "Dagger of Venom", item_type: "weapon" })).toBe("flat");
    expect(itemStaging({ name: "Ammunition of Fiend Slaying", item_type: "weapon" })).toBe("flat");
    expect(itemStaging({ name: "Plate Armor", item_type: "armor" })).toBe("stand");
    expect(itemStaging({ name: "Animated Shield", item_type: "armor" })).toBe("flat");
    expect(itemStaging({ name: "Wand of Fear", item_type: "wand" })).toBe("short");
    expect(itemStaging({ name: "Sack", item_type: "gear" })).toBe("flat");
    expect(itemStaging({ name: "Pole (10-foot)", item_type: "gear" })).toBe("upright");
  });

  it("picks a scene that fits the staging, the same one every run", () => {
    const upright = itemScene({ name: "Staff of Frost", item_type: "staff" });
    expect(["rack", "lodgeWall", "pillar", "pine"]).toContain(upright);
    expect(itemScene({ name: "Staff of Frost", item_type: "staff" })).toBe(upright);
    expect(["armorStand", "lodgeStand"]).toContain(itemScene({ name: "Plate Armor", item_type: "armor" }));
    expect(["alchemist", "hall", "trader"]).toContain(itemScene({ name: "Potion of Heroism", item_type: "potion" }));
  });

  it("varies the scene across a type rather than using one backdrop", () => {
    const potions = ["Healing", "Heroism", "Flying", "Speed", "Growth", "Climbing", "Resistance", "Diminution"];
    const scenes = new Set(potions.map((p) => itemScene({ name: `Potion of ${p}`, item_type: "potion" })));
    expect(scenes.size).toBeGreaterThan(1);
  });

  it("builds a setting from the scene, a wand's size, and the shared thread", () => {
    const wand = itemSetting({ name: "Wand of Fear", item_type: "wand" });
    expect(wand).toContain(ITEM_SCENES[itemScene({ name: "Wand of Fear", item_type: "wand" })]);
    expect(wand).toContain("about the length of a forearm");
    expect(wand).toContain("no plain or studio background");
    expect(itemSetting({ name: "Sack", item_type: "gear" })).not.toContain("forearm");
  });
});

describe("slugs and paths", () => {
  it("derives slugs", () => {
    expect(entrySlug({ kind: "spell", id: "srd_2024_fireball" })).toBe("spell-srd_2024_fireball");
    expect(entrySlug({ kind: "monster", id: "srd_srd_sprite" })).toBe("monster-srd_srd_sprite");
    expect(entrySlug({ kind: "item", name: "Ale, mug" })).toBe("item-ale-mug");
    expect(entrySlug({ kind: "item", name: "Bag of Holding" })).toBe("item-bag-of-holding");
    expect(() => entrySlug({ kind: "item", name: "!!!" })).toThrow();
  });

  it("puts originals under the srd/ prefix and variants beside them", () => {
    const path = newOriginalPath("11111111-1111-1111-1111-111111111111");
    expect(path).toBe("srd/11111111-1111-1111-1111-111111111111.webp");
    expect(variantPath(path, 400)).toBe("srd/11111111-1111-1111-1111-111111111111_w400.webp");
    expect(imageProvenanceStem(variantPath(path, 400))).toBe(imageProvenanceStem(path));
  });

  it("serves both buckets through the CDN", () => {
    expect(isCdnBucket(BUCKET_FOR_KIND.spell)).toBe(true);
    expect(isCdnBucket(BUCKET_FOR_KIND.item)).toBe(true);
    expect(BUCKET_FOR_KIND.monster).toBe("monster-images");
    expect(isCdnBucket(BUCKET_FOR_KIND.monster)).toBe(true);
  });

  it("never upscales a variant", () => {
    expect(variantSize({ width: 1024, height: 1536 }, 400)).toEqual({ width: 400, height: 600 });
    expect(variantSize({ width: 300, height: 450 }, 600)).toEqual({ width: 300, height: 450 });
  });
});

describe("row selection", () => {
  const spells = [
    { id: "srd_fireball", name: "Fireball" },
    { id: "srd_2024_fireball", name: "Fireball" },
    { id: "srd_2014_fireball", name: "FIREBALL" },
    { id: "srd_shield", name: "Shield" },
  ];

  it("gives the image to the spell and to namesakes without canonical art of their own", () => {
    expect(selectSpellRowsToUpdate({ id: "srd_fireball", name: "Fireball" }, spells, new Set(["srd_2014_fireball"]))).toEqual([
      "srd_2024_fireball",
      "srd_fireball",
    ]);
  });

  it("always includes the target, even when it already has a canonical row", () => {
    expect(selectSpellRowsToUpdate({ id: "srd_shield", name: "Shield" }, spells, new Set(["srd_shield"]))).toEqual(["srd_shield"]);
  });

  it("lands a monster image on that id only, whatever shares its name", () => {
    expect(selectMonsterRowsToUpdate({ id: "srd_srd_sprite" })).toEqual(["srd_srd_sprite"]);
  });

  it("selects every item of that name", () => {
    expect(selectItemRowsToUpdate(["ale, mug"], [{ id: "a", name: "Ale, Mug" }, { id: "b", name: "Ale, mug" }, { id: "c", name: "Ale" }])).toEqual(["a", "b"]);
  });

  it("lands a shared item image on every row of each name it is shared with", () => {
    const items = [{ id: "c", name: "Holy Avenger (Dagger)" }, { id: "a", name: "Holy Avenger" }, { id: "b", name: "holy avenger" }, { id: "d", name: "Defender" }];
    const names = itemNames({ name: "Holy Avenger", alsoNames: ["Holy Avenger (Dagger)"] });
    expect(names).toEqual(["Holy Avenger", "Holy Avenger (Dagger)"]);
    expect(selectItemRowsToUpdate(names, items)).toEqual(["a", "b", "c"]);
  });

  it("escapes like patterns", () => {
    expect(escapeLikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("manifest", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it("upserts, updates and round trips through disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "library-art-"));
    dirs.push(dir);
    expect(readManifest(dir)).toEqual(emptyManifest());
    let m = upsertEntry(emptyManifest(), entry("spell-a"));
    m = upsertEntry(m, entry("spell-b"));
    m = upsertEntry(m, { ...entry("spell-a"), subject: "replaced" });
    expect(m.entries.map((e) => e.slug)).toEqual(["spell-a", "spell-b"]);
    expect(m.entries[0].subject).toBe("replaced");
    m = updateEntry(m, "spell-b", { status: "approved" });
    writeManifest(dir, m);
    expect(readManifest(dir)).toEqual(m);
    expect(() => updateEntry(m, "nope", {})).toThrow(/No manifest entry/);
  });

  it("selects approved entries, or all unpublished with approveAll, narrowed by only", () => {
    const m = { version: 1 as const, entries: [entry("a", "approved"), entry("b", "candidate"), entry("c", "published")] };
    expect(selectForPublish(m, { approveAll: false, only: null }).map((e) => e.slug)).toEqual(["a"]);
    expect(selectForPublish(m, { approveAll: true, only: null }).map((e) => e.slug)).toEqual(["a", "b"]);
    expect(selectForPublish(m, { approveAll: true, only: "b" }).map((e) => e.slug)).toEqual(["b"]);
    expect(() => selectForPublish(m, { approveAll: true, only: "zzz" })).toThrow(/no such manifest entry/);
  });
});

describe("arguments and refusals", () => {
  it("parses generate", () => {
    expect(parseCli(["generate", "--spell", "a", "--spell", "b", "--item", "Ale, mug", "--out", "d"])).toEqual({
      command: "generate", spells: ["a", "b"], monsters: [], items: ["Ale, mug"], out: "d", only: null, yesSpend: false, subject: null, also: [], imageModel: null,
    });
  });

  it("renders on another image model with --image-model", () => {
    expect(parseCli(["generate", "--item", "Sack", "--image-model", "gpt-image-2.5-sunburst", "--out", "d"])).toMatchObject({ imageModel: "gpt-image-2.5-sunburst" });
    expect(() => parseCli(["generate", "--item", "Sack", "--image-model", "dall-e-3", "--out", "d"])).toThrow(/gpt-image/);
    expect(() => parseCli(["publish", "--out", "d", "--image-model", "gpt-image-2"])).toThrow(/belongs to generate/);
  });

  it("shares one item's picture with --also names", () => {
    expect(parseCli(["generate", "--item", "Longsword (+1)", "--also", " Longsword (+2) ", "--also", "Longsword (+3)", "--out", "d"])).toMatchObject({
      items: ["Longsword (+1)"], also: ["Longsword (+2)", "Longsword (+3)"],
    });
    expect(() => parseCli(["generate", "--item", "a", "--item", "b", "--also", "c", "--out", "d"])).toThrow(/exactly one --item/);
    expect(() => parseCli(["generate", "--spell", "a", "--also", "c", "--out", "d"])).toThrow(/exactly one --item/);
    expect(() => parseCli(["generate", "--item", "a", "--also", " ", "--out", "d"])).toThrow(/must not be empty/);
    expect(() => parseCli(["generate", "--item", "Ale", "--also", "ale", "--out", "d"])).toThrow(/twice/);
    expect(() => parseCli(["publish", "--out", "d", "--also", "x"])).toThrow(/belongs to generate/);
  });

  it("takes a written subject for exactly one entry", () => {
    expect(parseCli(["generate", "--item", "Quarterstaff", "--out", "d", "--subject", "  A staff on a table.  "])).toMatchObject({
      items: ["Quarterstaff"], subject: "A staff on a table.",
    });
    expect(() => parseCli(["generate", "--spell", "a", "--spell", "b", "--out", "d", "--subject", "x"])).toThrow(/exactly one/);
    expect(() => parseCli(["generate", "--spell", "a", "--out", "d", "--subject", "   "])).toThrow(/must not be empty/);
    expect(() => parseCli(["publish", "--out", "d", "--subject", "x"])).toThrow(/belongs to generate/);
  });

  it("parses --monster", () => {
    expect(parseCli(["generate", "--monster", "srd_srd_sprite", "--monster", "x", "--out", "d"])).toMatchObject({
      command: "generate", monsters: ["srd_srd_sprite", "x"], spells: [], items: [],
    });
    expect(parseCli(["generate", "--monster", "a", "--out", "d", "--subject", "A tiny winged archer."])).toMatchObject({ subject: "A tiny winged archer." });
    expect(() => parseCli(["generate", "--monster", "a", "--spell", "b", "--out", "d", "--subject", "x"])).toThrow(/exactly one/);
    expect(() => parseCli(["publish", "--out", "d", "--monster", "a"])).toThrow(/belong to generate/);
  });

  it("parses publish", () => {
    expect(parseCli(["publish", "--out", "d", "--approve-all", "--write", "--library-owner", "11111111-1111-1111-1111-111111111111"])).toMatchObject({
      command: "publish", approveAll: true, write: true, yesProduction: false, libraryOwner: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("rejects bad input", () => {
    expect(() => parseCli(["generate", "--out", "d"])).toThrow(/at least one entry/);
    expect(() => parseCli(["generate", "--spell", "a"])).toThrow(/--out/);
    expect(() => parseCli(["bogus", "--out", "d"])).toThrow(/Usage/);
    expect(() => parseCli(["publish", "--out", "d", "--spell", "a"])).toThrow(/belong to generate/);
    expect(() => parseCli(["generate", "--spell", "a", "--out", "d", "--write"])).toThrow(/belong to publish/);
    expect(() => parseCli(["publish", "--out", "d", "--library-owner", "nope"])).toThrow(/uuid/);
  });

  it("waits as long as a rate-limit message asks, plus a second", () => {
    expect(retryAfterMs("Limit 5, Used 5, Requested 1. Please try again in 12s. Visit https://platform.openai.com")).toBe(13000);
    expect(retryAfterMs("Please try again in 1.5s.")).toBe(2500);
    expect(retryAfterMs("Please try again in 500ms.")).toBe(1500);
    expect(retryAfterMs("Rate limit reached.")).toBe(20000);
  });

  it("refuses to spend without --yes-spend", () => {
    expect(() => assertMaySpend({ yesSpend: false })).toThrow(/--yes-spend/);
    expect(() => assertMaySpend({ yesSpend: true })).not.toThrow();
  });

  it("refuses a hosted write without --yes-production, and allows dry runs and loopback", () => {
    const hosted = "https://abc.supabase.co";
    expect(() => assertMayWrite({ write: true, yesProduction: false }, hosted)).toThrow(/--yes-production/);
    expect(() => assertMayWrite({ write: true, yesProduction: true }, hosted)).not.toThrow();
    expect(() => assertMayWrite({ write: false, yesProduction: false }, hosted)).not.toThrow();
    expect(() => assertMayWrite({ write: true, yesProduction: false }, "http://127.0.0.1:54321")).not.toThrow();
  });

  it("narrows entries with --only", () => {
    const refs = [{ kind: "spell" as const, id: "a" }, { kind: "item" as const, name: "Ale" }];
    expect(selectEntries(refs, "item-ale")).toEqual([refs[1]]);
    expect(selectEntries(refs, null)).toEqual(refs);
    expect(() => selectEntries(refs, "spell-zzz")).toThrow(/none of the requested/);
  });
});

describe("encoding round trip", () => {
  it("makes a marked WebP original and marked variants", async () => {
    const width = 300;
    const height = 450;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 7) % 251;
    const providerPng = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();

    const final = await encodeFinal(new Uint8Array(providerPng), prov, { width, height, quality: 82 });
    expect(sniffIsWebp(final)).toBe(true);
    expect(readWebpProvenance(final)).toEqual(prov);
    expect(await sharp(final).metadata()).toMatchObject({ format: "webp", width, height });

    const variants = await buildVariants(final, "srd/x.webp", prov);
    expect(variants.map((v) => v.path)).toEqual(["srd/x_w200.webp", "srd/x_w300.webp", "srd/x_w400.webp", "srd/x_w600.webp"]);
    for (const v of variants) {
      expect(sniffIsWebp(v.bytes)).toBe(true);
      expect(readWebpProvenance(v.bytes)).toEqual(prov);
      const meta = await sharp(v.bytes).metadata();
      expect(meta.width).toBe(Math.min(v.width, width));
    }
  });
});
