import { describe, expect, it } from "vitest";
import { asShown, handoutsSection, MAX_HANDOUTS_SHOWN, offeredHandout, parseShow, pictureUrl, shownText } from "./show.ts";

const ID = "11111111-2222-4333-8444-555555555555";

describe("parseShow", () => {
  // Bug caught: two ids in one call (a handout and a picture) taken as one of them, the other silently dropped.
  it("takes exactly one id", () => {
    expect(parseShow({ handout_id: ID })).toEqual({ ok: true, value: { what: "handout", id: ID } });
    expect(parseShow({ person_id: ID })).toEqual({ ok: true, value: { what: "person", id: ID } });
    expect(parseShow({}).ok).toBe(false);
    expect(parseShow({ handout_id: ID, place_id: ID }).ok).toBe(false);
  });

  // Bug caught: a shared library monster or item (a text id) refused, so most creatures could never be shown; or a
  // text id accepted for a person or a handout, which are always the campaign's own rows.
  it("takes a library id for an item or a creature, and only a campaign id for anything else", () => {
    expect(parseShow({ creature_id: "srd_owlbear" })).toEqual({ ok: true, value: { what: "creature", id: "srd_owlbear" } });
    expect(parseShow({ item_id: "srd_potion-of-healing" }).ok).toBe(true);
    expect(parseShow({ person_id: "srd_owlbear" }).ok).toBe(false);
    expect(parseShow({ handout_id: "the letter" }).ok).toBe(false);
    expect(parseShow({ creature_id: "an owlbear; drop table" }).ok).toBe(false);
  });
});

describe("offeredHandout", () => {
  const offers = Array.from({ length: MAX_HANDOUTS_SHOWN + 2 }, (_, i) => ({ id: `h${i}`, title: `Letter ${i}` }));
  // Bug caught: a handout the narrator was never shown (one it guessed, or one beyond the list) handed over.
  it("finds only a handout that was listed", () => {
    expect(offeredHandout(offers, "h0")).toEqual({ id: "h0", title: "Letter 0" });
    expect(offeredHandout(offers, `h${MAX_HANDOUTS_SHOWN}`)).toBeNull();
    expect(offeredHandout(offers, "nope")).toBeNull();
  });
});

describe("pictureUrl", () => {
  // Bug caught: a stored address that is not a plain https address (a script, a data blob, markup) reaching an image tag.
  it.each(["javascript:alert(1)", "data:image/png;base64,AAAA", "https://cdn.example/a.webp\"><script>", "ftp://x/a.png", "", 7, null])("refuses %j", (raw) => {
    expect(pictureUrl(raw)).toBeNull();
  });

  it("keeps the campaign's stored art, and a local stack's", () => {
    expect(pictureUrl(" https://assets.example/npc/a.webp ")).toBe("https://assets.example/npc/a.webp");
    expect(pictureUrl("http://127.0.0.1:54321/storage/v1/object/public/a.webp")).toBe("http://127.0.0.1:54321/storage/v1/object/public/a.webp");
    expect(pictureUrl("http://evil.example/a.webp")).toBeNull();
  });
});

describe("handoutsSection", () => {
  it("says nothing when there is nothing to hand over", () => {
    expect(handoutsSection([])).toBe("");
  });

  // Bug caught: a handout listed with no id to give it by.
  it("lists each handout with its id", () => {
    expect(handoutsSection([{ id: ID, title: "The Guild's letter" }])).toContain(`- "The Guild's letter" [handout_id ${ID}]`);
  });
});

describe("what is kept of a shown thing", () => {
  // Bug caught: a stored row redrawn on reload without being read (a picture's address is untrusted jsonb).
  it("reads back only a whole handout or a whole picture", () => {
    expect(asShown({ kind: "handout", id: ID, title: "A letter" })).toEqual({ kind: "handout", id: ID, title: "A letter" });
    expect(asShown({ kind: "picture", of: "person", title: "Honeycomb", url: "https://a.example/h.webp" })).toEqual({ kind: "picture", of: "person", title: "Honeycomb", url: "https://a.example/h.webp" });
    expect(asShown({ kind: "picture", of: "person", title: "Honeycomb", url: "javascript:alert(1)" })).toBeNull();
    expect(asShown({ kind: "picture", of: "dragon", title: "x", url: "https://a.example/h.webp" })).toBeNull();
    expect(asShown({ kind: "handout", id: "nope", title: "A letter" })).toBeNull();
    expect(asShown({ kind: "handout", id: ID, title: " " })).toBeNull();
    expect(asShown("nonsense")).toBeNull();
  });

  // Bug caught: the narrator retelling a handout the player is meant to read for themselves.
  it("tells the narrator not to retell a handout", () => {
    expect(shownText({ kind: "handout", id: ID, title: "A letter" })).toContain("do not retell what it says");
  });
});
