import { describe, expect, it, vi } from "vitest";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { askLinkLines, chosenAskLinks, conceptBlock, failedRun, matchKey, matchOption, picturePart, readAskLinks, resolveAskLinks, sameWord, saveFailure, spent } from "./askAdapterKit";

const isQuotaExceeded = vi.hoisted(() => vi.fn((e: unknown) => e instanceof Error && e.message === "quota"));
vi.mock("@/lib/quotaError", () => ({ isQuotaExceeded }));

describe("spent", () => {
  it("counts a priced line and treats an unpriced or absent line as nothing, not NaN", () => {
    expect(spent({ label: "x", value: "", credits: 7 })).toBe(7);
    expect(spent({ label: "x", value: "", credits: null })).toBe(0);
    expect(spent(undefined)).toBe(0);
  });
});

describe("failedRun", () => {
  it("is one failed part with the reason, and no record or route to open", () => {
    expect(failedRun("Item", "No.")).toEqual({ record: null, route: null, parts: [{ label: "Item", ok: false, credits: 0, error: "No." }] });
  });
});

describe("conceptBlock", () => {
  it("asks for a description when there is none, in the page's own words when given", () => {
    expect(conceptBlock("", "item")?.message).toBe("Say what this item is like first.");
    expect(conceptBlock("", "item", { empty: "Say it." })?.message).toBe("Say it.");
  });
  it("refuses a description past the generator's own limit, and allows the limit itself", () => {
    expect(conceptBlock("x".repeat(AI_PROMPT_LIMIT + 1), "item")?.message).toBe(`Shorten the description to ${AI_PROMPT_LIMIT} characters.`);
    expect(conceptBlock("x".repeat(AI_PROMPT_LIMIT), "item")).toBeNull();
    expect(conceptBlock("xxxxxx", "item", { limit: 5, shorten: "steer" })?.message).toBe("Shorten the steer to 5 characters.");
  });
});

describe("word matching", () => {
  it("sameWord ignores case, spacing, hyphens and underscores", () => {
    expect(sameWord("Fire-Ball", "fire ball")).toBe(true);
    expect(sameWord("fire_ball", "  FIRE   ball ")).toBe(true);
    expect(sameWord("fire", "fireball")).toBe(false);
  });
  it("matchKey returns the app's key for a loosely spelled word, null for an unknown one or no word", () => {
    expect(matchKey("Wondrous Item", ["weapon", "wondrous_item"] as const)).toBe("wondrous_item");
    expect(matchKey("sword", ["weapon"] as const)).toBeNull();
    expect(matchKey(null, ["weapon"] as const)).toBeNull();
  });
  it("matchOption finds an option by its id or its label and never passes on a word the picker lacks", () => {
    const options = [{ id: "str", label: "Strength" }];
    expect(matchOption("strength", options)).toBe("str");
    expect(matchOption("STR", options)).toBe("str");
    expect(matchOption("charm", options)).toBeNull();
    expect(matchOption(null, options)).toBeNull();
  });
});

describe("saveFailure", () => {
  it("names the plan limit for a quota race, the error's own words otherwise, the fallback for a non-error", () => {
    expect(saveFailure(new Error("quota"), "items", "fb")).toBe("You have reached your limit of items on this plan.");
    expect(saveFailure(new Error("disk"), "items", "fb")).toBe("disk");
    expect(saveFailure("x", "items", "fb")).toBe("fb");
  });
});

describe("picturePart", () => {
  it("is ok with the credits spent when saved", () => {
    expect(picturePart({ saved: true, credits: 3, noun: "item" })).toEqual({ label: "Picture", ok: true, credits: 3 });
  });
  it("is failed with no retry for a kind that cannot be painted again, and names the label", () => {
    const part = picturePart({ label: "Emblem", saved: false, credits: 3, noun: "faction" });
    expect(part).toEqual({ label: "Emblem", ok: false, credits: 0, error: "The emblem could not be painted. The faction is saved without one." });
  });
  it("retries through the page's paint flow: ok on a url, the flow's own error on none, the quoted credits when the price is unknown", async () => {
    const paint = vi.fn().mockResolvedValueOnce("u").mockResolvedValueOnce(null);
    const part = picturePart({ saved: false, credits: 4, noun: "item", retry: { credits: null, paint, error: () => "Out of luck." } });
    expect(part.retry?.credits).toBeNull();
    // The repainted picture rides on the part, so the chat shows the new one.
    expect(await part.retry?.run()).toEqual({ label: "Picture", ok: true, credits: 4, picture: "u" });
    expect(await part.retry?.run()).toEqual({ label: "Picture", ok: false, credits: 0, error: "Out of luck." });
  });
  it("charges a retry at its own price once it is known", async () => {
    const part = picturePart({ saved: false, credits: 4, noun: "item", retry: { credits: 2, paint: async () => "u", error: () => null } });
    expect(await part.retry?.run()).toMatchObject({ ok: true, credits: 2 });
  });
});

describe("links", () => {
  const A = "00000000-0000-4000-8000-0000000000a1";
  const read = (links: unknown) => readAskLinks("npc", { links });

  it("reads a tie whose kind, id and relation the contract and catalogue allow, the relation as the catalogue's word", () => {
    expect(read([{ kind: "deity", id: A, relation: "Worships" }])).toEqual([{ kind: "deity", id: A, relation: "worships" }]);
  });

  // Bug caught: the browser trusted the server's check, so an Adjust edit or stale proposal could carry any tie.
  it("skips a malformed entry, a kind the generator lacks, a non-uuid id, a kin word and a relation of another pair", () => {
    expect(read([
      "worships", { kind: "quest", id: A, relation: "seeks" }, { kind: "deity", id: "Auril", relation: "worships" },
      { kind: "npc", id: A, relation: "parent_of" }, { kind: "item", id: A, relation: "worships" },
    ])).toEqual([]);
    expect(read("worships Auril")).toEqual([]);
  });

  it("keeps one tie per record and word, and at most eight", () => {
    expect(read([{ kind: "deity", id: A, relation: "worships" }, { kind: "deity", id: A, relation: "worships" }])).toHaveLength(1);
    const many = Array.from({ length: 12 }, (_, i) => ({ kind: "deity", id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, relation: "worships" }));
    expect(read(many)).toHaveLength(8);
  });

  it("reads nothing for a generator that takes no ties", () => {
    expect(readAskLinks("monster", { links: [{ kind: "deity", id: A, relation: "worships" }] })).toEqual([]);
  });

  it("resolves a tie to the catalogue's choice, in its stored direction, only for records found in this campaign", () => {
    const links = [{ kind: "npc" as const, id: A, relation: "apprentice_of" }, { kind: "deity" as const, id: A, relation: "worships" }];
    const resolved = resolveAskLinks("npc", links, new Map([[`npc:${A}`, "Brenna"]]));
    expect(resolved).toMatchObject([{ kind: "npc", id: A, name: "Brenna", choice: { key: "mentor_of", subjectIsFrom: false } }]);
    const key = `link:npc:${A}:mentor_of:false`;
    expect(askLinkLines(resolved)).toEqual([{ label: "Apprentice of", value: "Brenna", credits: null, choice: { key, on: true } }]);
  });

  // Bug caught: a tie the DM set to no still written, or one they never touched dropped.
  it("starts each tie at yes and keeps only the ties left at yes", () => {
    const resolved = resolveAskLinks("npc", [{ kind: "npc", id: A, relation: "apprentice_of" }], new Map([[`npc:${A}`, "Brenna"]]));
    const key = `link:npc:${A}:mentor_of:false`;
    expect(chosenAskLinks(resolved)).toHaveLength(1);
    expect(chosenAskLinks(resolved, { [key]: false })).toEqual([]);
    expect(askLinkLines(resolved, { [key]: false })[0].choice).toEqual({ key, on: false });
  });
});
