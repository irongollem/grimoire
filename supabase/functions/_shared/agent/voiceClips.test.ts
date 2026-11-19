import { describe, expect, it } from "vitest";
import { clipKey, clipPrefix, listAccountClips, listNoteReadings, noteReadingPrefix } from "./voiceClips.ts";
import type { R2Config } from "../r2/config.ts";

const store = { bucket: "grimoire-table-voices" } as R2Config;
const A = { campaignId: "c1", sessionId: "s1" };
const B = { campaignId: "c1", sessionId: "s10" };

describe("clipPrefix", () => {
  // Bug caught: sitting "s1" deleted together with every clip of sitting "s10", whose id begins the same way.
  it("ends in a slash, so one sitting's prefix is never another's", () => {
    expect(clipPrefix(A)).toBe("c1/s1/");
    expect(clipKey(B, "abc").startsWith(clipPrefix(A))).toBe(false);
    expect(clipKey(A, "abc")).toBe("c1/s1/abc.mp3");
  });
});

describe("listAccountClips", () => {
  // Bug caught: an export that names fewer files than deletion removes, or that hides a sitting it could not list.
  it("lists every sitting's clips, and names a sitting it could not list instead of leaving it out", async () => {
    const list = async (_store: R2Config, prefix: string): Promise<string[]> => {
      if (prefix === "c1/s10/") throw new Error("listing failed");
      return [`${prefix}one.mp3`, `${prefix}two.mp3`];
    };
    const out = await listAccountClips(store, [A, B], list);
    expect(out.keys).toEqual(["c1/s1/one.mp3", "c1/s1/two.mp3"]);
    expect(out.errors).toEqual(["table voices: listing failed"]);
  });

  it("lists nothing on a stack that keeps no clips", async () => {
    expect(await listAccountClips(null, [A], async () => ["x"])).toEqual({ keys: [], errors: [] });
  });
});

describe("listNoteReadings", () => {
  const store = { bucket: "b" } as unknown as Parameters<typeof listNoteReadings>[0];

  // Bug caught: one note's prefix matching another note's recordings (no trailing slash), so an export lists, and
  // a deletion removes, a recording that is not this note's.
  it("lists each note's own recordings, and names a note whose listing failed", async () => {
    expect(noteReadingPrefix({ campaignId: "c1", noteId: "n1" })).toBe("note-readings/c1/n1/");
    const listed = await listNoteReadings(store, [{ campaignId: "c1", noteId: "n1" }, { campaignId: "c1", noteId: "n2" }], async (_s, prefix) => {
      if (prefix.includes("/n2/")) throw new Error("store down");
      return [`${prefix}abc.mp3`];
    });
    expect(listed.keys).toEqual(["note-readings/c1/n1/abc.mp3"]);
    expect(listed.errors).toEqual(["note readings: store down"]);
  });
});
