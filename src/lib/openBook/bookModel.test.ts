import { describe, expect, it } from "vitest";
import type {
  OpenBookDeity,
  OpenBookFaction,
  OpenBookLore,
  OpenBookPantheon,
  OpenBookPerson,
  OpenBookPlace,
  OpenBookSession,
  OpenBookSnapshot,
} from "@/types/openBook.types";
import { buildBookModel, CHAPTER_META } from "./bookModel";

const place = (id: string, name: string, parent_id: string | null = null, extra: Partial<OpenBookPlace> = {}): OpenBookPlace => ({
  id,
  parent_id,
  name,
  location_type: null,
  player_summary: null,
  description: null,
  image_url: null,
  tags: null,
  is_level: null,
  is_battle_map: null,
  npcs_shared: null,
  map: null,
  pins: [],
  ...extra,
});

const person = (id: string, name: string, location_id: string | null = null): OpenBookPerson => ({
  id,
  name,
  race: null,
  occupation: null,
  status: null,
  relationship: null,
  portrait_url: null,
  portrait_focal_point: null,
  cutout_url: null,
  location_id,
  former_name: null,
  former_portrait_url: null,
});

const faction = (id: string, name: string, description: string | null = null): OpenBookFaction => ({
  id,
  name,
  faction_type: null,
  description,
  emblem_url: null,
  alignment: null,
  tags: null,
  party_standing: null,
  descent: null,
});

const pantheon = (id: string, name: string): OpenBookPantheon => ({ id, name, description: null, emblem_url: null, tags: null });

const deity = (id: string, name: string, pantheon_id: string | null): OpenBookDeity => ({
  id,
  pantheon_id,
  name,
  titles: null,
  alternate_names: null,
  alignment: null,
  symbol: null,
  symbol_image_url: null,
  portrait_url: null,
  portrait_focal_point: null,
  domains: null,
  portfolio: null,
  description: null,
  tags: null,
});

const lore = (id: string, title: string, content: string | null = null): OpenBookLore => ({
  id,
  title,
  category: null,
  content,
  tags: null,
  is_pinned: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

const session = (id: string, number: number | null, real_date: string | null, content: string | null = null): OpenBookSession => ({
  id,
  title: `Raw ${id}`,
  content,
  tags: null,
  session: { number, title: `Session title ${id}`, played_on: null },
  date: null,
  real_date,
  created_at: "2026-01-01",
});

const mentionDoc = (id: string, entityType = "npc") =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "entityMention", attrs: { id, entityType } }] }],
  });

function snapshot(over: Partial<OpenBookSnapshot> = {}): OpenBookSnapshot {
  return {
    v: 1,
    book: {
      title: "T",
      subtitle: null,
      cover_art: "tooled",
      cover_image_url: null,
      leather: "oxblood",
      chapters: ["atlas", "folk", "factions", "pantheon", "lore", "chronicle"],
      campaign_name: "C",
    },
    calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    places: [],
    folk: [],
    factions: [],
    pantheons: [],
    deities: [],
    lore: [],
    sessions: [],
    events: [],
    names: {},
    ...over,
  };
}

describe("buildBookModel chapters", () => {
  it("lists only chosen chapters that hold entries, in book order, with numerals", () => {
    const model = buildBookModel(
      snapshot({
        book: { ...snapshot().book, chapters: ["lore", "atlas", "folk"] },
        places: [place("p1", "Reach")],
        lore: [lore("l1", "A tale")],
        folk: [],
      }),
    );
    expect(model.chapters.map((c) => c.chapter)).toEqual(["atlas", "lore"]);
    expect(model.chapters[0]).toMatchObject({ numeral: "I", title: "The Atlas", tab: "Atlas" });
    expect(CHAPTER_META.chronicle.numeral).toBe("VI");
  });

  it("does not include entries of a chapter the book leaves out", () => {
    const model = buildBookModel(
      snapshot({ book: { ...snapshot().book, chapters: ["atlas"] }, places: [place("p1", "A")], lore: [lore("l1", "B")] }),
    );
    expect(model.entries.map((e) => e.id)).toEqual(["p1"]);
  });

  it("gives each entry a path relative to the book root", () => {
    const model = buildBookModel(snapshot({ places: [place("p1", "A")] }));
    expect(model.entries[0]).toMatchObject({ kind: "place", chapter: "atlas", path: "atlas/p1" });
  });
});

describe("atlas order and place lookups", () => {
  const snap = snapshot({
    places: [
      place("b", "Orphan", "gone"),
      place("a", "Realm"),
      place("a1", "Town", "a"),
      place("a1x", "Inn", "a1"),
      place("a2", "Keep", "a"),
    ],
  });

  it("orders depth first, siblings in snapshot order, orphans as roots", () => {
    const model = buildBookModel(snap);
    expect(model.chapters[0].entries.map((e) => e.id)).toEqual(["b", "a", "a1", "a1x", "a2"]);
  });

  it("answers children and ancestors, root first", () => {
    const model = buildBookModel(snap);
    expect(model.childrenOf("a").map((p) => p.id)).toEqual(["a1", "a2"]);
    expect(model.childrenOf("b")).toEqual([]);
    expect(model.ancestorsOf("a1x").map((p) => p.id)).toEqual(["a", "a1"]);
    expect(model.ancestorsOf("b")).toEqual([]);
  });

  it("survives a parent cycle without losing places", () => {
    const model = buildBookModel(snapshot({ places: [place("x", "X", "y"), place("y", "Y", "x")] }));
    expect(model.entries.map((e) => e.id).sort()).toEqual(["x", "y"]);
    expect(model.ancestorsOf("x").map((p) => p.id)).toEqual(["y"]);
  });

  it("lists the people at a place", () => {
    const model = buildBookModel(
      snapshot({ places: [place("a", "A")], folk: [person("n1", "Ann", "a"), person("n2", "Bo", "nowhere"), person("n3", "Cy")] }),
    );
    expect(model.peopleAt("a").map((p) => p.id)).toEqual(["n1"]);
    expect(model.peopleAt("zzz")).toEqual([]);
  });
});

describe("entry subtitles", () => {
  it("shows each kind's own descriptor, and nothing when it has none", () => {
    const model = buildBookModel(
      snapshot({
        book: { ...snapshot().book, chapters: ["atlas", "folk", "factions", "pantheon", "lore", "chronicle"] },
        places: [place("p1", "Reach", null, { location_type: "region" }), place("p2", "Plain")],
        folk: [
          { ...person("n1", "Ann"), occupation: "Smith", race: "Dwarf" },
          { ...person("n2", "Bo"), race: "Elf" },
          person("n3", "Cy"),
        ],
        factions: [{ ...faction("f1", "Guild"), faction_type: "trade" }, faction("f2", "Band")],
        pantheons: [pantheon("pa", "Old Gods")],
        deities: [{ ...deity("d1", "Sun", "pa"), titles: "The Bright" }],
        lore: [{ ...lore("l1", "Tale"), category: "myth" }, lore("l2", "Rumour")],
        sessions: [session("s1", 4, null), session("s2", null, null)],
      }),
    );
    const sub = (id: string) => model.byId.get(id)?.subtitle;
    expect([sub("p1"), sub("p2")]).toEqual(["region", null]);
    expect([sub("n1"), sub("n2"), sub("n3")]).toEqual(["Smith", "Elf", null]);
    expect([sub("f1"), sub("f2")]).toEqual(["trade", null]);
    expect([sub("pa"), sub("d1")]).toEqual([null, "The Bright"]);
    expect([sub("l1"), sub("l2")]).toEqual(["myth", null]);
    expect([sub("s1"), sub("s2")]).toEqual(["Session 4", null]);
  });
});

describe("pantheon chapter", () => {
  it("follows each pantheon with its deities, then deities with no pantheon in the book", () => {
    const model = buildBookModel(
      snapshot({
        pantheons: [pantheon("pa", "Old Gods"), pantheon("pb", "New Gods")],
        deities: [deity("d1", "Lone", null), deity("d2", "Sun", "pb"), deity("d3", "Moon", "pa"), deity("d4", "Stray", "missing")],
      }),
    );
    const chapter = model.chapters.find((c) => c.chapter === "pantheon");
    expect(chapter?.entries.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "pantheon:pa",
      "deity:d3",
      "pantheon:pb",
      "deity:d2",
      "deity:d1",
      "deity:d4",
    ]);
    expect(model.deitiesOf("pb").map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("chronicle", () => {
  it("orders sessions oldest first by number, then real date, and keeps events out of the entries", () => {
    const model = buildBookModel(
      snapshot({
        sessions: [
          session("s3", 3, "2026-03-01"),
          session("sn", null, "2026-01-01"),
          session("s1b", 1, "2026-02-01"),
          session("s1a", 1, "2026-01-01"),
        ],
        events: [
          {
            id: "e",
            title: "Feast",
            description: null,
            event_type: null,
            year: 1,
            month: 1,
            day: 1,
            festival_day: null,
            is_multi_day: null,
            end_year: null,
            end_month: null,
            end_day: null,
            color: null,
          },
        ],
      }),
    );
    const chronicle = model.chapters.find((c) => c.chapter === "chronicle");
    expect(chronicle?.entries.map((e) => e.id)).toEqual(["s1a", "s1b", "s3", "sn"]);
    expect(chronicle?.entries[0]).toMatchObject({ title: "Session title s1a", subtitle: "Session 1" });
    expect(model.byId.has("e")).toBe(false);
  });
});

describe("nameFor", () => {
  it("prefers an entry title, then the snapshot's names, else null", () => {
    const model = buildBookModel(snapshot({ places: [place("p", "Reach")], names: { p: "ignored", c: "Brave Hero" } }));
    expect(model.nameFor("p")).toBe("Reach");
    expect(model.nameFor("c")).toBe("Brave Hero");
    expect(model.nameFor("zzz")).toBeNull();
  });
});

describe("backlinks", () => {
  it("finds entries whose rich text cites an id, in book order, never themselves", () => {
    const model = buildBookModel(
      snapshot({
        places: [place("p", "Reach", null, { description: mentionDoc("n1") })],
        folk: [person("n1", "Ann")],
        factions: [faction("f", "Guild", mentionDoc("n1"))],
        lore: [lore("l", "Tale", mentionDoc("l")), lore("l2", "Other", "plain text, no mention")],
        sessions: [session("s", 1, null, mentionDoc("n1"))],
      }),
    );
    expect(model.backlinks("n1").map((e) => e.id)).toEqual(["p", "f", "s"]);
    expect(model.backlinks("l")).toEqual([]);
    expect(model.backlinks("nope")).toEqual([]);
  });

  it("counts only entity mentions with an id, not other nodes that carry one", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "image", attrs: { id: "x", src: "/a.png" } },
        { type: "paragraph", content: [{ type: "entityMention", attrs: { id: "", entityType: "npc" } }] },
      ],
    });
    const model = buildBookModel(snapshot({ lore: [lore("l", "Tale", doc)] }));
    expect(model.backlinks("x")).toEqual([]);
    expect(model.backlinks("")).toEqual([]);
  });

  it("counts a name cited only through snapshot.names", () => {
    const model = buildBookModel(snapshot({ lore: [lore("l", "Tale", mentionDoc("pc", "player"))], names: { pc: "Hero" } }));
    expect(model.backlinks("pc").map((e) => e.id)).toEqual(["l"]);
  });

  it("lists an entry once however often it cites the id", () => {
    const twice = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "entityMention", attrs: { id: "x", entityType: "npc" } }] },
        { type: "paragraph", content: [{ type: "entityMention", attrs: { id: "x", entityType: "npc" } }] },
      ],
    });
    const model = buildBookModel(snapshot({ lore: [lore("l", "Tale", twice)] }));
    expect(model.backlinks("x")).toHaveLength(1);
  });
});

describe("index", () => {
  it("groups by first letter ignoring a leading The, with non-letters last", () => {
    const model = buildBookModel(
      snapshot({
        places: [place("1", "The Ashen Keep"), place("2", "Brook"), place("3", "Ábel's Rest"), place("4", "13th Gate")],
        folk: [person("5", "Anselm")],
      }),
    );
    expect(model.index.map((g) => g.letter)).toEqual(["A", "B", "#"]);
    expect(model.index[0].entries.map((e) => e.title)).toEqual(["Ábel's Rest", "Anselm", "The Ashen Keep"]);
  });

  it("sorts inside a letter as if the leading The were not there", () => {
    const model = buildBookModel(snapshot({ places: [place("1", "Azure Coast"), place("2", "The Alder Wood"), place("3", "Anselm's Ford")] }));
    expect(model.index[0].entries.map((e) => e.title)).toEqual(["The Alder Wood", "Anselm's Ford", "Azure Coast"]);
  });
});
