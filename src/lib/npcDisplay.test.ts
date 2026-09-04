import { describe, it, expect } from "vitest";
import {
  fieldsForFirstReveal,
  getNpcDisplayName,
  getNpcPlayerFacingName,
  NPC_DEFAULT_REVEAL_FIELDS,
  NPC_PLAYER_FIELDS,
} from "./npcDisplay";

describe("fieldsForFirstReveal", () => {
  it("seeds name + portrait when the DM has never chosen any", () => {
    // Revealing an NPC with no fields ticked puts a blank card in the players'
    // portal — the reveal appears to do nothing at all.
    expect(fieldsForFirstReveal([])).toEqual([...NPC_DEFAULT_REVEAL_FIELDS]);
  });

  it("leaves an existing choice alone", () => {
    expect(fieldsForFirstReveal(["occupation"])).toEqual(["occupation"]);
  });

  it("does not re-add a default the DM removed", () => {
    // The failure this guards: a DM unticks "portrait", hides the NPC, reveals
    // it again, and the portrait is back. Re-revealing is not a fresh start.
    const chosen = ["name"];
    expect(fieldsForFirstReveal(chosen)).toEqual(["name"]);
    expect(fieldsForFirstReveal(chosen)).not.toContain("portrait");
  });

  it("copies rather than aliasing, so the caller cannot mutate the defaults", () => {
    const first = fieldsForFirstReveal([]);
    first.push("occupation");
    expect(fieldsForFirstReveal([])).toEqual([...NPC_DEFAULT_REVEAL_FIELDS]);
  });
});

describe("NPC_DEFAULT_REVEAL_FIELDS", () => {
  it("only names fields the DM can actually toggle", () => {
    // A default outside NPC_PLAYER_FIELDS would be stored on reveal and then be
    // invisible and un-untickable in every reveal control.
    const togglable = new Set<string>(NPC_PLAYER_FIELDS.map((f) => f.key));
    for (const key of NPC_DEFAULT_REVEAL_FIELDS) expect(togglable).toContain(key);
  });
});

describe("getNpcPlayerFacingName", () => {
  // The true name a chat announcement must never carry.
  const rowan = {
    name: "Rowan Blackthorn",
    disguise_name: "Old Marek",
    disguise_portrait_url: null,
    is_revealed: false,
    player_visible_fields: ["name", "portrait"],
  };

  it("gives the cover name while the alter ego is unrevealed", () => {
    expect(getNpcPlayerFacingName(rowan)).toBe("Old Marek");
  });

  it("gives the true name once the DM reveals it", () => {
    expect(getNpcPlayerFacingName({ ...rowan, is_revealed: true })).toBe("Rowan Blackthorn");
  });

  it("gives no name at all when the DM has not ticked the name field", () => {
    // The portal card renders "???" here, so chat may not say more. Returning
    // null rather than a string is the point: a caller cannot accidentally
    // print it, and there is no fallback string tempting anyone to widen it.
    expect(getNpcPlayerFacingName({ ...rowan, player_visible_fields: ["portrait"] })).toBeNull();
    expect(getNpcPlayerFacingName({ ...rowan, player_visible_fields: [] })).toBeNull();
  });

  it("withholds the true name even when the disguise is revealed", () => {
    // The reveal unmasks the alter ego; it does not tick the name field. This
    // is the case that shipped broken — "Old Marek is revealed to be Rowan
    // Blackthorn." went into chat while the card still said "???".
    expect(
      getNpcPlayerFacingName({ ...rowan, is_revealed: true, player_visible_fields: ["portrait"] }),
    ).toBeNull();
  });

  it("never returns the true name of a concealed NPC, whatever the fields", () => {
    for (const fields of [[], ["name"], ["portrait"], ["name", "portrait", "occupation"]]) {
      expect(getNpcPlayerFacingName({ ...rowan, player_visible_fields: fields }))
        .not.toBe("Rowan Blackthorn");
    }
  });

  it("keeps the true name for a portrait-only disguise, exactly as the projection does", () => {
    // `get_player_visible_npcs` swaps the name only when disguise_name is set;
    // a purely visual disguise leaves the name alone. The two must agree, or
    // chat and the portal card contradict each other.
    const masked = { ...rowan, disguise_name: null, disguise_portrait_url: "/mask.webp" };
    expect(getNpcPlayerFacingName(masked)).toBe("Rowan Blackthorn");
  });

  it("differs from getNpcDisplayName only by the field gate", () => {
    // getNpcDisplayName is the DM's view and must stay ungated — the DM sees
    // both identities everywhere. This asserts the two have not been merged.
    const hidden = { ...rowan, player_visible_fields: [] };
    expect(getNpcDisplayName(hidden)).toBe("Old Marek");
    expect(getNpcPlayerFacingName(hidden)).toBeNull();
  });
});

describe("what a discovery announcement says", () => {
  // The composition `NpcRevealControl` performs, kept here because neither half
  // is wrong on its own — the bug was the order. A first reveal seeds the field
  // list and announces in the same breath, so the announcement must read the
  // fields being *written*, not the ones on the row. Reading the row says
  // "someone" for every first reveal; reading `npc.name` spoils every disguise.
  function announce(
    npc: Parameters<typeof getNpcPlayerFacingName>[0],
    audience: string[],
  ): string {
    const nextFields = audience.length
      ? fieldsForFirstReveal(npc.player_visible_fields)
      : [...npc.player_visible_fields];
    return getNpcPlayerFacingName({ ...npc, player_visible_fields: nextFields }) ?? "someone";
  }

  const neverShared = {
    name: "Rowan Blackthorn",
    disguise_name: "Old Marek",
    disguise_portrait_url: null,
    is_revealed: false,
    player_visible_fields: [] as string[],
  };

  it("names the cover when the party first discovers a disguised NPC", () => {
    // The players' People list shows "Old Marek" here, so chat says the same.
    expect(announce(neverShared, ["pc-1", "pc-2"])).toBe("Old Marek");
  });

  it("names the true identity once the DM has revealed the alter ego", () => {
    expect(announce({ ...neverShared, is_revealed: true }, ["pc-1"])).toBe("Rowan Blackthorn");
  });

  it("names no one when the DM removed the name field before sharing", () => {
    // Not empty — empty means "never chosen" and seeds the defaults. A list the
    // DM has pruned to portrait-only is a deliberate choice and stands.
    expect(announce({ ...neverShared, player_visible_fields: ["portrait"] }, ["pc-1"]))
      .toBe("someone");
  });

  it("never puts the true name in a discovery announcement while concealed", () => {
    for (const fields of [[], ["portrait"], ["name"], ["name", "portrait", "occupation"]]) {
      expect(announce({ ...neverShared, player_visible_fields: fields }, ["pc-1"]))
        .not.toBe("Rowan Blackthorn");
    }
  });
});
