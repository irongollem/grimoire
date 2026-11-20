// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { splitIntoChapters } from "@/scriptorium/data/templates/chapters";
import { chapterTitle } from "@/scriptorium/lib/chapterTitle";
import { atlasOrder, buildCampaignBook, type BookSource } from "./canonBook";

const empty: BookSource = {
  premise: [], truths: [], lore: [], forces: [], secrets: [], questions: [], places: [], folk: [],
  factions: [], pantheons: [], deities: [], quests: [], monsters: [], items: [], spells: [],
};
const full: BookSource = {
  premise: [{ id: "pr1", title: "Grim" }],
  truths: [{ id: "t1", title: "The sea is dying" }],
  lore: [{ id: "l1", title: "Fall", world_year: null, world_month: null, world_day: null }],
  forces: [{ id: "f1", title: "The Tide Cult" }],
  secrets: [{ id: "s1", title: "The king is drowned" }],
  questions: [{ id: "q1", title: "Who lit the beacon?" }],
  places: [{ id: "p1", parent_id: null, name: "Saltmere", location_type: "city", sort_order: null }],
  folk: [{ id: "n1", name: "Rosie", location_id: "p1" }],
  factions: [{ id: "fa1", name: "Guild" }],
  pantheons: [{ id: "pa1", name: "The Tides" }],
  deities: [{ id: "d1", name: "Nerith", pantheon_id: "pa1" }],
  quests: [{ id: "qu1", title: "Find the beacon" }],
  monsters: [{ id: "m1", name: "Drowned" }],
  items: [{ id: "i1", name: "Pearl" }],
  spells: [{ id: "sp1", name: "Ebb" }],
};

const titles = (b: { chapters: { content: JSONContent }[] }) => b.chapters.map((c) => chapterTitle(c.content));
const embeds = (node: JSONContent | undefined): JSONContent[] =>
  node === undefined ? [] : node.type === "entityEmbed" ? [node] : (node.content ?? []).flatMap(embeds);
const ids = (c: { content: JSONContent }) => embeds(c.content).map((e) => `${e.attrs?.entityType}:${e.attrs?.entityId}`);

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("buildCampaignBook", () => {
  it("leaves chapters III, IV and VIII (and the bestiary and treasures) out of a players' book", () => {
    // Fails if the players' copy ever prints what moves behind the screen, a secret or the quests.
    expect(titles(buildCampaignBook(full, "players"))).toEqual(["The World", "History and Legend", "Gazetteer", "Folk", "Factions and Powers"]);
  });

  it("gives the DM every chapter, in order", () => {
    expect(titles(buildCampaignBook(full, "dm"))).toEqual([
      "The World", "History and Legend", "What is Moving", "Secrets", "Gazetteer", "Folk", "Factions and Powers", "Adventures", "Bestiary", "Treasures and Spells",
    ]);
  });

  it("leaves a chapter out when it has nothing to hold", () => {
    expect(buildCampaignBook(empty, "dm").chapters).toEqual([]);
    expect(titles(buildCampaignBook({ ...empty, quests: full.quests }, "dm"))).toEqual(["Adventures"]);
  });

  it("sets each secret in a DM box and nothing else", () => {
    const chapters = buildCampaignBook(full, "dm").chapters;
    const secrets = chapters.find((c) => chapterTitle(c.content) === "Secrets")!;
    const body = secrets.content.content!;
    const boxed = body.filter((n) => n.type === "secretBlock");
    expect(boxed).toHaveLength(1);
    expect(ids({ content: boxed[0] })).toEqual(["canon:s1"]);
    // The open question is an ordinary entry, outside any box.
    expect(body.filter((n) => n.type === "entityEmbed").map((n) => n.attrs?.entityId)).toEqual(["q1"]);
  });

  it("opens every chapter with its own level-1 heading, so a book cut into chapters finds the same ones", () => {
    const { chapters } = buildCampaignBook(full, "dm");
    for (const c of chapters) expect(c.content.content![0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    const joined: JSONContent = { type: "doc", content: chapters.flatMap((c) => c.content.content!) };
    expect(splitIntoChapters(joined)).toHaveLength(chapters.length);
  });

  it("puts lore in the order of its date in the world, the undated last", () => {
    const lore = [
      { id: "none", title: "n", world_year: null, world_month: null, world_day: null },
      { id: "late", title: "l", world_year: 900, world_month: null, world_day: null },
      { id: "early", title: "e", world_year: 12, world_month: 3, world_day: null },
    ];
    const chapter = buildCampaignBook({ ...empty, lore }, "dm").chapters[0];
    expect(ids(chapter)).toEqual(["canon:early", "canon:late", "canon:none"]);
  });

  it("orders the Gazetteer as the Atlas does: a place before what lies within it, by scale", () => {
    const places = [
      { id: "tavern", parent_id: "city", name: "Tavern", location_type: "tavern" as const, sort_order: null },
      { id: "city", parent_id: "region", name: "City", location_type: "city" as const, sort_order: null },
      { id: "region", parent_id: null, name: "Region", location_type: "region" as const, sort_order: null },
    ];
    expect(atlasOrder(places).map((p) => p.id)).toEqual(["region", "city", "tavern"]);
  });

  it("groups folk under where they live and sends the homeless, or those of an unlisted place, to Elsewhere", () => {
    const folk = [
      { id: "a", name: "A", location_id: "p1" },
      { id: "b", name: "B", location_id: null },
      { id: "c", name: "C", location_id: "unlisted" },
    ];
    const chapter = buildCampaignBook({ ...full, folk }, "dm").chapters.find((c) => chapterTitle(c.content) === "Folk")!;
    const flat = chapter.content.content!.map((n) => (n.type === "heading" ? `# ${n.content![0].text}` : `${n.attrs?.entityId}`));
    expect(flat).toEqual(["# Folk", "# Saltmere", "a", "# Elsewhere", "b", "c"]);
  });

  it("builds a book that loads into the editor without dropping a node (a canon link, a DM box, a link of every kind)", () => {
    const { chapters } = buildCampaignBook(full, "dm");
    for (const chapter of chapters) {
      editor = new Editor({ element: document.createElement("div"), content: chapter.content as object, extensions: createScriptoriumExtensions() });
      const flat = (n: JSONContent): string[] => [n.type ?? "", ...(n.content ?? []).flatMap(flat)];
      expect(flat(editor.getJSON()).filter((t) => t === "entityEmbed" || t === "secretBlock")).toEqual(
        flat(chapter.content).filter((t) => t === "entityEmbed" || t === "secretBlock"),
      );
      editor.destroy();
    }
    editor = null;
  });

  it("links entries and copies none of them: only a type and an id", () => {
    const all = buildCampaignBook(full, "dm").chapters.flatMap((c) => embeds(c.content));
    expect(all.length).toBeGreaterThan(10);
    for (const e of all) expect(Object.keys(e.attrs ?? {}).sort()).toEqual(["entityId", "entityType", "startsPage"]);
  });
});
