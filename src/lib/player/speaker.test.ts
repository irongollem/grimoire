import { describe, expect, it } from "vitest";
import { minderTagOfName, speakerFor } from "./speaker";
import type { CharacterCaretaker } from "@/types/caretaker.types";

const handOver = { id: "h1", party_member_id: "p1", caretaker_user_id: "tomas" } as CharacterCaretaker;
const mira = { id: "p1", name: "Mira" };
const bram = { id: "p2", name: "Bram" };

describe("speakerFor", () => {
  it("speaks for a minded character under the caretaker's name and tags the line", () => {
    expect(speakerFor(mira, [handOver], "tomas", "Tomas")).toEqual({ name: "Tomas, for Mira", forPartyMemberId: "p1" });
  });

  it("leaves the owner's own line alone", () => {
    expect(speakerFor(mira, [handOver], "owner", "Olive")).toEqual({ name: "Mira", forPartyMemberId: null });
  });

  it("leaves a character nobody minds alone", () => {
    expect(speakerFor(bram, [handOver], "tomas", "Tomas")).toEqual({ name: "Bram", forPartyMemberId: null });
    expect(speakerFor(mira, [], "tomas", "Tomas").forPartyMemberId).toBeNull();
  });

  it("is plain without a signed-in user", () => {
    expect(speakerFor(mira, [handOver], null, "Tomas").forPartyMemberId).toBeNull();
  });
});

describe("minderTagOfName", () => {
  it("finds the character a speaker name speaks for", () => {
    expect(minderTagOfName("Tomas, for Mira", [handOver], "tomas", "Tomas", [bram, mira])).toBe("p1");
  });

  it("is null for a plain character name or an NPC", () => {
    expect(minderTagOfName("Mira", [handOver], "tomas", "Tomas", [mira])).toBeNull();
    expect(minderTagOfName("Innkeeper", [handOver], "tomas", "Tomas", [mira])).toBeNull();
  });
});
