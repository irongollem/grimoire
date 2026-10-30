import { describe, expect, it } from "vitest";
import { documentMeta } from "./documentCardMeta";
import type { ScriptoriumDocumentSummary } from "@/types/scriptorium.types";

const party = new Map([
  ["p1", "Pip"],
  ["p2", "Wren"],
  ["p3", "Bramble"],
]);
const base: Pick<ScriptoriumDocumentSummary, "theme" | "player_visible_to" | "word_count" | "scriptorium_chapters"> = {
  theme: "letter",
  player_visible_to: [],
  word_count: 212,
  scriptorium_chapters: [{ count: 1 }],
};

describe("documentMeta", () => {
  it("says a handout is not given yet when nobody holds it", () => {
    expect(documentMeta({ ...base, kind: "handout", theme: "notice" }, party)).toBe("Notice · not given yet");
  });

  it("names the holders, and says the whole party when everyone has it", () => {
    expect(documentMeta({ ...base, kind: "handout", player_visible_to: ["p1", "p2"] }, party)).toBe("Letter · with Pip and Wren");
    expect(documentMeta({ ...base, kind: "handout", theme: "plain", player_visible_to: ["p1", "p2", "p3"] }, party)).toBe(
      "Plain page · with the whole party",
    );
  });

  it("counts holders the active party cannot name instead of naming a stranger", () => {
    expect(documentMeta({ ...base, kind: "handout", player_visible_to: ["p1", "gone"] }, party)).toBe("Letter · with 2 players");
  });

  it("sizes a book by chapters and words, singular for one chapter", () => {
    expect(documentMeta({ ...base, kind: "book", theme: "onednd2024", word_count: 185103, scriptorium_chapters: [{ count: 15 }] }, party)).toBe(
      "15 chapters · 185,103 words",
    );
    expect(documentMeta({ ...base, kind: "book", theme: "onednd2024" }, party)).toBe("1 chapter · 212 words");
  });
});
