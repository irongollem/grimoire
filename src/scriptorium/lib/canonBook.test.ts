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
  arcs: [], peoples: [], habitats: [], backstories: [], world: { calendar: null, coins: [] },
  clades: [], species: [], forms: [], links: [], habitatSpecies: [], habitatLife: [], statBlockNameByForm: new Map(),
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
  arcs: [{ id: "a1", name: "The Drowning", summary: "The sea takes the coast.", question: "Can the tide be turned?", stakes: null, ending: null }],
  peoples: [{ id: "pe1", name: "Saltfolk", percent: 60, text: "They read the tide.\n\nThey fear the deep." }],
  habitats: [{ id: "h1", name: "The flats", text: "", otherPercent: null }],
  backstories: [{ id: "b1", title: "Mara" }],
  clades: [], species: [], forms: [], links: [], habitatSpecies: [], habitatLife: [], statBlockNameByForm: new Map(),
  world: { calendar: { name: "Harptos", epoch: "DR", months: ["Hammer", "Alturiak"] }, coins: ["gold", "silver"] },
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
  it("leaves the DM's chapters (arcs, forces, secrets, backstories, how the world works) and the bestiary and treasures out of a players' book", () => {
    // Fails if the players' copy ever prints what moves behind the screen, a secret or the quests.
    expect(titles(buildCampaignBook(full, "players"))).toEqual(["The World", "History and Legend", "Peoples", "Habitats", "Gazetteer", "Folk", "Factions and Powers"]);
  });

  // Bug caught (#1279 item 23): the book left out Arcs, Peoples, Habitats, Backstories and How the world works, so "the whole canon as a book" lacked half of it.
  it("writes arcs, peoples and habitats out as text, and links the backstories", () => {
    const chapters = buildCampaignBook(full, "dm").chapters;
    const text = (title: string) => JSON.stringify(chapters.find((c) => chapterTitle(c.content) === title)!.content);
    expect(text("Arcs")).toContain("The sea takes the coast.");
    expect(text("Arcs")).toContain("What it asks: Can the tide be turned?");
    expect(text("Arcs")).not.toContain("What is at stake");
    expect(text("Peoples")).toContain("Saltfolk (60%)");
    expect(text("Peoples")).toContain("They fear the deep.");
    // A habitat with nothing written is still in the book, by name.
    expect(text("Habitats")).toContain("The flats");
    expect(text("How the World Works")).toContain("years counted in DR");
    expect(text("How the World Works")).toContain("gold, silver");
    expect(ids(chapters.find((c) => chapterTitle(c.content) === "Backstories")!)).toEqual(["canon:b1"]);
  });

  it("gives the DM every chapter, in order", () => {
    expect(titles(buildCampaignBook(full, "dm"))).toEqual([
      "The World", "How the World Works", "History and Legend", "Peoples", "Habitats", "Arcs", "What is Moving", "Secrets", "Backstories", "Gazetteer", "Folk", "Factions and Powers", "Adventures", "Bestiary", "Treasures and Spells",
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

describe("the habitats and the field guide (#1283)", () => {
  const sp = (id: string, name: string, over: Partial<BookSource["species"][number]> = {}): BookSource["species"][number] => ({
    id, name, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, text: "", sortOrder: 0, ...over,
  });
  const clade = (id: string, name: string, parentId: string | null = null) => ({ id, name, rank: null, parentId, description: null, sortOrder: 0 });
  const eco: BookSource = {
    ...empty,
    habitats: [{ id: "h1", name: "The flats", text: "Mud and gulls.", otherPercent: 10 }],
    clades: [clade("c1", "Birds"), clade("c2", "Waders", "c1")],
    species: [
      sp("s1", "Mud Heron", { scientificName: "Ardea limosa", cladeId: "c2", livesAs: "pairs", activity: "twilight", seasons: { winter: { away: true, note: null } }, text: "Tall and grey." }),
      sp("s2", "Sea Kale", { kingdom: "plant" }),
      sp("s3", "Pith Piper", { cladeId: "c2" }),
    ],
    forms: [
      { id: "f1", speciesId: "s1", label: "Old", stageOrder: 1, domesticated: false, monsterId: null, libraryMonsterId: null },
      { id: "f0", speciesId: "s1", label: "Young", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: null },
      { id: "f2", speciesId: "s3", label: "Household", stageOrder: 0, domesticated: true, monsterId: null, libraryMonsterId: null },
    ],
    // The heron eats the piper: read from the piper's page, it is "is eaten by".
    links: [{ id: "k1", fromSpeciesId: "s1", kind: "eats", toSpeciesId: "s3", fromFormId: null, toFormId: null, habitatId: null, note: null }],
    habitatSpecies: [
      { id: "hs1", habitatId: "h1", speciesId: "s1", abundance: "common", sortOrder: 0 },
      { id: "hs2", habitatId: "h1", speciesId: "s2", abundance: "rare", sortOrder: 1 },
    ],
    habitatLife: [
      { habitatId: "h1", speciesId: "s1", formId: "f0", percent: 30 },
      { habitatId: "h1", speciesId: "s1", formId: "f1", percent: 20 },
    ],
  };
  const chapterText = (b: BookSource, title: string) => JSON.stringify(buildCampaignBook(b, "dm").chapters.find((c) => chapterTitle(c.content) === title)?.content);

  // Bug caught: a worked-out share printed blank (or the form shares not summed per species).
  it("prints each species of a habitat with how common it is and its share, and a plant with none", () => {
    const text = chapterText(eco, "Habitats");
    expect(text).toContain("Mud Heron: Common, about 50% of what is met");
    expect(text).toContain("Sea Kale: Rare");
    expect(text).not.toContain("Sea Kale: Rare,");
    expect(text).toContain("Mud and gulls.");
  });

  it("works a share out for a form the DM left empty", () => {
    // Other 10, the DM set none of 30 and 20 -> the free 90 - 50 goes to the one unset form.
    const text = chapterText({ ...eco, habitatLife: [{ habitatId: "h1", speciesId: "s1", formId: "f0", percent: 30 }, { habitatId: "h1", speciesId: "s1", formId: "f1", percent: null }] }, "Habitats");
    expect(text).toContain("about 90% of what is met");
  });

  // Bug caught: the Field guide chapter printed (empty) for a campaign with no species.
  it("omits the Field guide when there are no species, and puts it right after Habitats when there are", () => {
    expect(titles(buildCampaignBook({ ...eco, species: [], forms: [], links: [], habitatSpecies: [], habitatLife: [] }, "dm"))).toEqual(["Habitats"]);
    expect(titles(buildCampaignBook(eco, "dm"))).toEqual(["Habitats", "Field guide"]);
  });

  // Bug caught: a species with no clade was dropped, or printed under another clade.
  it("groups species by clade path and files a species with no clade under 'In no clade'", () => {
    const text = chapterText(eco, "Field guide");
    expect(text).toContain("Birds, Waders");
    expect(text.indexOf("Birds, Waders")).toBeLessThan(text.indexOf("In no clade"));
    expect(text.indexOf("In no clade")).toBeLessThan(text.indexOf("Sea Kale"));
    expect(text.indexOf("Mud Heron")).toBeLessThan(text.indexOf("In no clade"));
  });

  it("prints the scientific name in italics, how it lives, when, seasons, forms by stage and the description", () => {
    const text = chapterText(eco, "Field guide");
    expect(text).toContain('"marks":[{"type":"italic"}],"text":"Ardea limosa"');
    expect(text).toContain("Animal. In pairs. At dawn and dusk. Winter: away.");
    expect(text).toContain("Forms: Young, Old.");
    expect(text).toContain("Forms: Household (domesticated).");
    expect(text).toContain("Tall and grey.");
  });

  // Bug caught: a link was read from the wrong side, so the piper's page said "eats Pith Piper".
  it("reads each link from the page's own species' side", () => {
    const text = chapterText(eco, "Field guide");
    expect(text).toContain("Eats Pith Piper.");
    expect(text).toContain("Is eaten by Mud Heron.");
  });
});
