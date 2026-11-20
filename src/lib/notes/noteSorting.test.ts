import { describe, expect, it, vi } from "vitest";
import { sortFailureMessage, sortNote, SortStepError, suggestedKind, type SortChoice, type SortWrites } from "./noteSorting";
import type { Note } from "@/types/notes.types";

const note = { id: "n1", title: "The Flood", content: "{}", player_visible_to: ["pm1"], ai_provenance: null } as Note;

function writes(log: string[], failing: keyof SortWrites | null = null): SortWrites {
  const make = (name: keyof SortWrites) =>
    vi.fn(async () => {
      log.push(name);
      if (failing === name) throw new Error(`${name} failed`);
    });
  return {
    createLoreEntry: make("createLoreEntry"),
    linkToSession: make("linkToSession"),
    appendBackstory: make("appendBackstory"),
    appendDmNote: make("appendDmNote"),
    deleteNote: make("deleteNote"),
    removeFromList: make("removeFromList"),
  };
}

const MOVING: [string, SortChoice, string][] = [
  ["lore", { kind: "lore" }, "createLoreEntry"],
  ["backstory", { kind: "backstory", partyMemberId: "pm1" }, "appendBackstory"],
  ["dm-note", { kind: "dm-note", partyMemberId: "pm1" }, "appendDmNote"],
];

describe("sortNote", () => {
  it.each(MOVING)("writes the %s destination first, then deletes the note, then removes its row", async (_n, choice, write) => {
    // Fails if the note is deleted before its text has landed (the text would be lost on a failed write).
    const log: string[] = [];
    await sortNote(note, choice, writes(log));
    expect(log).toEqual([write, "deleteNote", "removeFromList"]);
  });

  it.each(MOVING)("deletes nothing when the %s write fails", async (_n, choice, write) => {
    // Fails if a failed write still deletes the note or takes it off the list.
    const log: string[] = [];
    await expect(sortNote(note, choice, writes(log, write as keyof SortWrites))).rejects.toMatchObject({ step: "write" });
    expect(log).toEqual([write]);
  });

  it("links a session note to its session and keeps the note", async () => {
    const log: string[] = [];
    await sortNote(note, { kind: "session", sessionId: "s1" }, writes(log));
    expect(log).toEqual(["linkToSession", "removeFromList"]);
  });

  it("keeping a note only takes it off the list", async () => {
    const log: string[] = [];
    await sortNote(note, { kind: "keep" }, writes(log));
    expect(log).toEqual(["removeFromList"]);
  });

  it("stops at a failed delete and says the text is in both places, leaving the row for a retry", async () => {
    // Fails if the row is removed after the note could not be deleted (the note would vanish from the list yet stay).
    const log: string[] = [];
    const error = await sortNote(note, { kind: "lore" }, writes(log, "deleteNote")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SortStepError);
    expect(log).toEqual(["createLoreEntry", "deleteNote"]);
    expect(sortFailureMessage("The Flood", error as SortStepError)).toContain("in both places");
  });

  it("hands the note's own text, audience and provenance to the lore entry", async () => {
    // Fails if a lore note is made visible to nobody (or everybody) instead of the people it was shared with.
    const w = writes([]);
    await sortNote(note, { kind: "lore" }, w);
    expect(w.createLoreEntry).toHaveBeenCalledWith(expect.objectContaining({ title: "The Flood", content: "{}", player_visible_to: ["pm1"] }));
  });
});

describe("suggestedKind", () => {
  it("suggests a lore entry for lore and a session for a session note", () => {
    expect(suggestedKind("lore")).toBe("lore");
    expect(suggestedKind("session")).toBe("session");
  });
});
