import { describe, it, expect } from "vitest";
import { parseSceneEntities, stripMentionTokens, type SceneEntitySources } from "./sceneEntities";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { Faction } from "@/types/faction.types";
import type { Location } from "@/types/location.types";

function npc(overrides: Partial<Npc>): Npc {
  return {
    id: "npc-1",
    name: "Gnarl",
    portrait_url: null,
    appearance: null,
    ...overrides,
  } as Npc;
}

function monster(overrides: Partial<Monster>): Monster {
  return {
    id: "mon-1",
    name: "Owlbear",
    image_url: null,
    description: null,
    ...overrides,
  } as Monster;
}

function partyMember(overrides: Partial<PartyMember>): PartyMember {
  return {
    id: "pm-1",
    name: "Aria",
    portrait_url: null,
    ...overrides,
  } as PartyMember;
}

function faction(overrides: Partial<Faction>): Faction {
  return {
    id: "faction-1",
    name: "Council of Speakers",
    faction_type: null,
    description: null,
    emblem_url: null,
    ...overrides,
  } as Faction;
}

function location(overrides: Partial<Location>): Location {
  return {
    id: "loc-1",
    name: "The Rusty Anchor",
    image_url: null,
    description: null,
    ...overrides,
  } as Location;
}

function resolve(text: string, sources: SceneEntitySources = {}) {
  return parseSceneEntities(text, sources);
}

describe("parseSceneEntities", () => {
  it("matches an underscore multi-word @mention against the entity's real (spaced) name", () => {
    const sources: SceneEntitySources = {
      factions: [faction({ name: "Council of Speakers", emblem_url: "https://example.test/council.webp" })],
    };
    const result = resolve("@Aria confronts the @Council_of_Speakers.", sources);
    expect(result.map((e) => e.label)).toContain("Council of Speakers");
  });

  it("resolves a faction mention with its emblem_url as the portrait and an emblem-not-a-character description", () => {
    const result = resolve("The @Thieves_Guild watches from the rooftops.", {
      factions: [faction({ name: "Thieves Guild", faction_type: "criminal syndicate", emblem_url: "https://example.test/guild.webp" })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Thieves Guild");
    expect(result[0].portraitUrl).toBe("https://example.test/guild.webp");
    expect(result[0].textDescription).toContain("a faction, criminal syndicate");
    expect(result[0].textDescription).toContain("emblem");
    expect(result[0].textDescription).toMatch(/never as a person or creature/);
  });

  it("gives a faction without an emblem a null portraitUrl but still a description", () => {
    const result = resolve("@Silverhand_Oath rules the city.", {
      factions: [faction({ name: "Silverhand Oath", emblem_url: null })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].portraitUrl).toBeNull();
    expect(result[0].textDescription).toBeTruthy();
    // No emblem is sent, so the description must not point the model at one.
    expect(result[0].textDescription).not.toMatch(/reference image/);
  });

  it("resolves @party to the group portrait when provided", () => {
    const result = resolve("@party enters the tavern.", { groupPortraitUrl: "https://example.test/party.webp" });
    expect(result).toEqual([
      { label: "Party", portraitUrl: "https://example.test/party.webp", textDescription: "The adventuring party" },
    ]);
  });

  it("ignores @party when no group portrait is set", () => {
    const result = resolve("@party enters the tavern.", { groupPortraitUrl: null });
    expect(result).toEqual([]);
  });

  it("ignores an unknown @mention that matches nothing", () => {
    const result = resolve("@Someone_Unknown walks by.", {
      npcs: [npc({ name: "Gnarl" })],
    });
    expect(result).toEqual([]);
  });

  it("dedupes a repeated mention of the same entity", () => {
    const result = resolve("@Gnarl draws his sword. @Gnarl grins.", {
      npcs: [npc({ name: "Gnarl" })],
    });
    expect(result).toHaveLength(1);
  });

  it("matches party members before NPCs, NPCs before monsters, monsters before locations, and locations before factions", () => {
    // Same token, ambiguous across every list — first list in match order wins.
    const resultVsNpc = resolve("@Gnarl appears.", {
      partyMembers: [partyMember({ name: "Gnarl", portrait_url: "https://example.test/pm.webp" })],
      npcs: [npc({ name: "Gnarl", portrait_url: "https://example.test/npc.webp" })],
    });
    expect(resultVsNpc[0].portraitUrl).toBe("https://example.test/pm.webp");

    const resultVsMonster = resolve("@Gnarl appears.", {
      npcs: [npc({ name: "Gnarl", portrait_url: "https://example.test/npc.webp" })],
      monsters: [monster({ name: "Gnarl", image_url: "https://example.test/mon.webp" })],
    });
    expect(resultVsMonster[0].portraitUrl).toBe("https://example.test/npc.webp");

    const resultVsLocation = resolve("@Gnarl appears.", {
      monsters: [monster({ name: "Gnarl", image_url: "https://example.test/mon.webp" })],
      locations: [location({ name: "Gnarl", image_url: "https://example.test/loc.webp" })],
    });
    expect(resultVsLocation[0].portraitUrl).toBe("https://example.test/mon.webp");

    const resultVsFaction = resolve("@Gnarl appears.", {
      locations: [location({ name: "Gnarl", image_url: "https://example.test/loc.webp" })],
      factions: [faction({ name: "Gnarl", emblem_url: "https://example.test/faction.webp" })],
    });
    expect(resultVsFaction[0].portraitUrl).toBe("https://example.test/loc.webp");
  });

  it("flattens rich-text NPC appearance and monster description to plain text and caps length", () => {
    const longText = "a".repeat(900);
    const richAppearance = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }],
    });
    const result = resolve("@Gnarl looms.", {
      npcs: [npc({ name: "Gnarl", appearance: richAppearance })],
    });
    expect(result[0].textDescription).not.toContain("{");
    expect(result[0].textDescription!.length).toBeLessThan(longText.length);
  });

  it("resolves a location mention with its image_url as the portrait and a flattened description", () => {
    const richDescription = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A crooked dockside tavern, lantern-lit." }] }],
    });
    const result = resolve("The party gathers at @The_Rusty_Anchor.", {
      locations: [location({ name: "The Rusty Anchor", image_url: "https://example.test/anchor.webp", description: richDescription })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("The Rusty Anchor");
    expect(result[0].portraitUrl).toBe("https://example.test/anchor.webp");
    expect(result[0].textDescription).toBe("The Rusty Anchor: A crooked dockside tavern, lantern-lit.");
  });

  it("gives a location without an image a null portraitUrl but still a description", () => {
    const result = resolve("@Whispering_Vale lies ahead.", {
      locations: [location({ name: "Whispering Vale", image_url: null })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].portraitUrl).toBeNull();
    expect(result[0].textDescription).toBe("Whispering Vale");
  });
});

describe("stripMentionTokens", () => {
  it("turns an underscore-joined @mention into a spaced name", () => {
    expect(stripMentionTokens("@Old_Vesper waits by the fire.")).toBe("Old Vesper waits by the fire.");
  });

  it("strips multiple mentions in one string", () => {
    expect(stripMentionTokens("@Aria and @Thorin_Ironfist face the @Dragon.")).toBe(
      "Aria and Thorin Ironfist face the Dragon.",
    );
  });

  it("leaves text with no mentions unchanged", () => {
    expect(stripMentionTokens("A quiet night at the tavern.")).toBe("A quiet night at the tavern.");
  });

  it("stops at punctuation the same way the parser's token regex does", () => {
    expect(stripMentionTokens("@Vesper, waiting.")).toBe("Vesper, waiting.");
  });
});
