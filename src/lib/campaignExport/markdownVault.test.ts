import { describe, expect, it } from "vitest";
import { buildMarkdownVault, collectMentionedMonsterIds, type MarkdownVaultInput } from "./markdownVault";
import type { Npc } from "@/types/npc.types";
import type { Location } from "@/types/location.types";
import type { Faction } from "@/types/faction.types";
import type { Note } from "@/types/notes.types";
import type { PartyMember } from "@/types/party.types";
import type { Quest, QuestObjective } from "@/types/quest.types";

function tiptapDoc(text: string): string {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}

function mentionDoc(id: string, entityType: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [
        { type: "text", text: "See " },
        { type: "entityMention", attrs: { id, entityType } },
        { type: "text", text: "." },
      ],
    }],
  });
}

function baseInput(overrides: Partial<MarkdownVaultInput> = {}): MarkdownVaultInput {
  return {
    campaignName: "Curse of the Ashen Vale",
    exportedAt: new Date("2026-09-28T12:00:00.000Z"),
    npcs: [],
    locations: [],
    factions: [],
    quests: [],
    questObjectives: [],
    partyMembers: [],
    notes: [],
    ...overrides,
  };
}

function npc(over: Partial<Npc> = {}): Npc {
  return {
    id: "npc-1",
    user_id: "u1",
    campaign_id: "c1",
    name: "Elminster",
    race: "Human",
    alignment: null,
    age: null,
    occupation: "Sage",
    location_id: null,
    appearance: tiptapDoc("A grey-bearded old man."),
    personality: tiptapDoc("Wry and forgetful."),
    backstory: null,
    notes: null,
    status: "alive",
    relationship: "friendly",
    portrait_url: null,
    cutout_url: null,
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: true,
    tags: ["wizard", "shadowdale"],
    stat_block: null,
    linked_monster_id: null,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("buildMarkdownVault — file layout", () => {
  it("writes one file per entity under its folder, plus a root README", () => {
    const files = buildMarkdownVault(baseInput({ npcs: [npc()] }));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["NPCs/Elminster.md", "README.md"]));
  });

  it("sanitizes and dedupes file names within a folder", () => {
    const files = buildMarkdownVault(baseInput({
      npcs: [
        npc({ id: "npc-1", name: "Bandit" }),
        npc({ id: "npc-2", name: "Bandit" }),
        npc({ id: "npc-3", name: "Who/What?" }),
      ],
    }));
    expect(files["NPCs/Bandit.md"]).toBeDefined();
    expect(files["NPCs/Bandit (2).md"]).toBeDefined();
    expect(files["NPCs/WhoWhat.md"]).toBeDefined();
  });

  it("falls back to Untitled for a nameless entity", () => {
    const files = buildMarkdownVault(baseInput({ npcs: [npc({ name: "" })] }));
    expect(files["NPCs/Untitled.md"]).toBeDefined();
  });
});

describe("buildMarkdownVault — NPC frontmatter and body", () => {
  it("renders frontmatter fields and converted rich-text sections", () => {
    const files = buildMarkdownVault(baseInput({ npcs: [npc()] }));
    const md = files["NPCs/Elminster.md"];
    expect(md).toContain('type: "npc"');
    expect(md).toContain('grimoire_id: "npc-1"');
    expect(md).toContain('race: "Human"');
    expect(md).toContain('occupation: "Sage"');
    expect(md).toContain('status: "alive"');
    expect(md).toContain("tags:\n  - \"wizard\"\n  - \"shadowdale\"");
    expect(md).toContain("# Elminster");
    expect(md).toContain("## Appearance\n\nA grey-bearded old man.");
    expect(md).toContain("## Personality\n\nWry and forgetful.");
  });

  it("skips a section for a field with no content", () => {
    const files = buildMarkdownVault(baseInput({ npcs: [npc({ backstory: null, notes: null })] }));
    const md = files["NPCs/Elminster.md"];
    expect(md).not.toContain("## Backstory");
    expect(md).not.toContain("## DM Notes");
  });
});

describe("buildMarkdownVault — @mentions become wikilinks", () => {
  it("resolves a mention of an exported NPC to its assigned file name", () => {
    const files = buildMarkdownVault(baseInput({
      npcs: [
        npc({ id: "npc-1", name: "Elminster", appearance: null }),
        npc({ id: "npc-2", name: "Bandit", appearance: mentionDoc("npc-1", "npc") }),
      ],
    }));
    expect(files["NPCs/Bandit.md"]).toContain("See [[NPCs/Elminster|Elminster]].");
  });

  it("resolves a mention against the entity's deduped file name, not its raw name", () => {
    const files = buildMarkdownVault(baseInput({
      npcs: [
        npc({ id: "npc-1", name: "Bandit", appearance: null }),
        npc({ id: "npc-2", name: "Bandit", appearance: null }),
        npc({ id: "npc-3", name: "Witness", appearance: mentionDoc("npc-2", "npc") }),
      ],
    }));
    // npc-2 is the second "Bandit" processed, so it was deduped to "Bandit (2)".
    expect(files["NPCs/Witness.md"]).toContain("See [[NPCs/Bandit (2)|Bandit (2)]].");
  });

  it("resolves a monster mention through the caller-supplied monsterNames map", () => {
    const files = buildMarkdownVault(baseInput({
      npcs: [npc({ appearance: mentionDoc("mon-1", "monster") })],
      monsterNames: { "mon-1": "Owlbear" },
    }));
    expect(files["NPCs/Elminster.md"]).toContain("See Owlbear.");
  });

  it("renders '???' for a monster mention whose id isn't in the monsterNames map", () => {
    const files = buildMarkdownVault(baseInput({
      npcs: [npc({ appearance: mentionDoc("mon-1", "monster") })],
    }));
    expect(files["NPCs/Elminster.md"]).toContain("See ???.");
  });

  it("renders the whole-party sentinel mention as prose, not a link", () => {
    const files = buildMarkdownVault(baseInput({
      npcs: [npc({ appearance: mentionDoc("party-group", "party") })],
    }));
    expect(files["NPCs/Elminster.md"]).toContain("See the party.");
  });

  it("renders '???' for a mention id that isn't in the export (stale/deleted)", () => {
    const files = buildMarkdownVault(baseInput({
      npcs: [npc({ appearance: mentionDoc("npc-ghost", "npc") })],
    }));
    expect(files["NPCs/Elminster.md"]).toContain("See ???.");
  });

  it("resolves a party-member mention (entityType 'player') to the Party folder's file name", () => {
    const pm: PartyMember = {
      id: "pm-1",
      user_id: "u1",
      owner_user_id: null,
      is_dm_managed: false,
      ruleset: "2014",
      campaign_id: "c1",
      name: "Aria Stormwind",
      player_name: "Sam",
      class: "Fighter",
      subclass: null,
      level: 5,
      subrace: null,
      species_id: null,
      disguise_species_id: null,
      disguise_race: null,
      disguise_subrace: null,
      background_id: null,
      max_hp: 40,
      current_hp: 40,
      temp_hp: 0,
      ac: 16,
      speed: 30,
      initiative_bonus: 2,
      current_initiative: null,
      str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10,
      proficiency_bonus: 3,
      skill_proficiencies: {},
      saving_throw_proficiencies: [],
      conditions: [],
      curses: [],
      inspiration: false,
      death_save_successes: 0,
      death_save_failures: 0,
      portrait_url: null,
      notes: null,
      sort_order: 0,
      cp: 0, sp: 0, ep: 0, gp: 0, pp: 0,
      tool_proficiencies: [],
      languages: [],
      weapon_masteries: [],
      spell_slots: [],
      current_location_id: null,
      carry_capacity_override: null,
      class_resources: {},
      class_choices: {},
      active_infusions: [],
      custom_attacks: [],
      level_choices: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const files = buildMarkdownVault(baseInput({
      partyMembers: [pm],
      npcs: [npc({ appearance: mentionDoc("pm-1", "player") })],
    }));
    expect(files["Party/Aria Stormwind.md"]).toContain('type: "party_member"');
    expect(files["Party/Aria Stormwind.md"]).toContain("level: 5");
    expect(files["NPCs/Elminster.md"]).toContain("See [[Party/Aria Stormwind|Aria Stormwind]].");
  });
});

describe("buildMarkdownVault — Locations", () => {
  function location(over: Partial<Location> = {}): Location {
    return {
      id: "loc-1",
      user_id: "u1",
      campaign_id: "c1",
      parent_id: null,
      name: "Shadowdale",
      location_type: "region",
      description: null,
      notes: null,
      tags: [],
      image_url: null,
      map_url: null,
      map_pins: [],
      is_map_shared: false,
      player_visible_to: [],
      player_summary: null,
      is_description_shared: false,
      is_npcs_shared: false,
      is_inventory_shared: false,
      npc_owner_id: null,
      related_location_ids: [],
      source_map_id: null,
      is_battle_map: false,
      grid_calibration: null,
      map_layer_url: null,
      map_layer_calibration: null,
      plan_size: null,
      era_start: null,
      era_end: null,
      audio_theme: null,
      sort_order: null,
      map_published_rev: null,
      is_level: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ...over,
    };
  }

  it("links a location's parent as a wikilink when the parent is also exported", () => {
    const files = buildMarkdownVault(baseInput({
      locations: [
        location({ id: "loc-1", name: "Shadowdale", parent_id: null }),
        location({ id: "loc-2", name: "Shadowvale", parent_id: "loc-1" }),
      ],
    }));
    expect(files["Locations/Shadowvale.md"]).toContain('parent: "[[Locations/Shadowdale|Shadowdale]]"');
    expect(files["Locations/Shadowdale.md"]).not.toContain("parent:");
  });

  it("renders the description section from Tiptap JSON", () => {
    const files = buildMarkdownVault(baseInput({
      locations: [location({ description: tiptapDoc("A quiet dale.") })],
    }));
    expect(files["Locations/Shadowdale.md"]).toContain("## Description\n\nA quiet dale.");
  });
});

describe("buildMarkdownVault — Factions", () => {
  function faction(over: Partial<Faction> = {}): Faction {
    return {
      id: "fac-1",
      user_id: "u1",
      campaign_id: "c1",
      name: "The Harpers",
      faction_type: "Secret Society",
      description: tiptapDoc("A network of do-gooders."),
      emblem_url: null,
      alignment: "Neutral Good",
      player_visible_to: [],
      tags: ["heroes"],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ...over,
    };
  }

  it("renders faction frontmatter and description", () => {
    const files = buildMarkdownVault(baseInput({ factions: [faction()] }));
    const md = files["Factions/The Harpers.md"];
    expect(md).toContain('faction_type: "Secret Society"');
    expect(md).toContain('alignment: "Neutral Good"');
    expect(md).toContain("## Description\n\nA network of do-gooders.");
  });
});

describe("buildMarkdownVault — Quests", () => {
  function quest(over: Partial<Quest> = {}): Quest {
    return {
      id: "q-1",
      user_id: "u1",
      campaign_id: "c1",
      parent_quest_id: null,
      title: "The Ashen Vale",
      summary: "Find the source of the ash storms.",
      status: "active",
      giver_npc_id: null,
      location_id: null,
      tags: [],
      player_visible_to: [],
      started_at: null,
      resolved_at: null,
      entry_beat_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ...over,
    };
  }
  function objective(over: Partial<QuestObjective> = {}): QuestObjective {
    return {
      id: "obj-1",
      quest_id: "q-1",
      description: "Reach the vale",
      status: "pending",
      is_player_visible: true,
      sort_order: 0,
      ...over,
    };
  }

  it("renders the summary and objectives list, sorted by sort_order", () => {
    const files = buildMarkdownVault(baseInput({
      quests: [quest()],
      questObjectives: [
        objective({ id: "obj-2", description: "Second", sort_order: 1, status: "complete" }),
        objective({ id: "obj-1", description: "First", sort_order: 0, status: "pending" }),
      ],
    }));
    const md = files["Quests/The Ashen Vale.md"];
    expect(md).toContain('status: "active"');
    expect(md).toContain("## Summary\n\nFind the source of the ash storms.");
    const objIdx1 = md.indexOf("First");
    const objIdx2 = md.indexOf("Second");
    expect(objIdx1).toBeGreaterThan(-1);
    expect(objIdx2).toBeGreaterThan(objIdx1);
    expect(md).toContain("**Complete:** Second");
  });

  it("links a sub-quest's parent quest", () => {
    const files = buildMarkdownVault(baseInput({
      quests: [
        quest({ id: "q-1", title: "Main Quest" }),
        quest({ id: "q-2", title: "Side Quest", parent_quest_id: "q-1" }),
      ],
    }));
    expect(files["Quests/Side Quest.md"]).toContain('parent: "[[Quests/Main Quest|Main Quest]]"');
  });

  it("omits the Objectives section when there are none", () => {
    const files = buildMarkdownVault(baseInput({ quests: [quest()], questObjectives: [] }));
    expect(files["Quests/The Ashen Vale.md"]).not.toContain("## Objectives");
  });
});

describe("buildMarkdownVault — Notes", () => {
  function note(over: Partial<Note> = {}): Note {
    return {
      id: "note-1",
      user_id: "u1",
      campaign_id: "c1",
      title: "Session 3 recap",
      content: tiptapDoc("The party arrived at the vale."),
      category: "session",
      tags: ["recap"],
      session_num: 3,
      is_pinned: false,
      player_visible_to: [],
      session_start_year: null,
      session_start_month: null,
      session_start_day: null,
      session_end_year: null,
      session_end_month: null,
      session_end_day: null,
      session_real_date: null,
      linked_calendar_event_id: null,
      sort_order: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ...over,
    };
  }

  it("renders frontmatter including session_num and the converted body", () => {
    const files = buildMarkdownVault(baseInput({ notes: [note()] }));
    const md = files["Notes/Session 3 recap.md"];
    expect(md).toContain('category: "session"');
    expect(md).toContain("session_num: 3");
    expect(md).toContain("The party arrived at the vale.");
  });

  it("omits session_num when null", () => {
    const files = buildMarkdownVault(baseInput({ notes: [note({ category: "general", session_num: null })] }));
    expect(files["Notes/Session 3 recap.md"]).not.toContain("session_num");
  });
});

describe("buildMarkdownVault — README", () => {
  it("names the campaign, the export date, and explains the two export formats", () => {
    const files = buildMarkdownVault(baseInput({ npcs: [npc()] }));
    const readme = files["README.md"];
    expect(readme).toContain("Curse of the Ashen Vale");
    expect(readme).toContain("2026-09-28");
    expect(readme).toContain(".grimoire-backup");
    expect(readme).toContain("[[NPCs/Elminster|Elminster]]");
  });

  it("omits a folder's section entirely when the campaign has none of that entity", () => {
    const files = buildMarkdownVault(baseInput());
    expect(files["README.md"]).not.toContain("## NPCs");
  });
});

describe("collectMentionedMonsterIds", () => {
  it("finds a monster mention nested inside an NPC's rich-text field", () => {
    const ids = collectMentionedMonsterIds(baseInput({
      npcs: [npc({ appearance: mentionDoc("mon-1", "monster") })],
    }));
    expect(ids).toEqual(["mon-1"]);
  });

  it("dedupes the same monster id mentioned in more than one field/entity", () => {
    const ids = collectMentionedMonsterIds(baseInput({
      npcs: [
        npc({ id: "npc-1", appearance: mentionDoc("mon-1", "monster") }),
        npc({ id: "npc-2", personality: mentionDoc("mon-1", "monster") }),
      ],
    }));
    expect(ids).toEqual(["mon-1"]);
  });

  it("ignores non-monster mentions", () => {
    const ids = collectMentionedMonsterIds(baseInput({
      npcs: [npc({ appearance: mentionDoc("npc-2", "npc") })],
    }));
    expect(ids).toEqual([]);
  });

  it("returns an empty array when there is nothing to scan", () => {
    expect(collectMentionedMonsterIds(baseInput())).toEqual([]);
  });
});
