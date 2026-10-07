// @vitest-environment jsdom
// DOMPurify (via sanitizeHtml) strips every tag under happy-dom; see sanitizeHtml.test.ts.
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MemorialCard from "./MemorialCard.vue";
import type { CharacterMemorial } from "@/types/memorial.types";

/** A stored Tiptap document, as RichTextEditor writes it; an empty string is a cleared editor. */
const DOC = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }] });

vi.mock("@/components/common/FocalImage.vue", () => ({ default: { template: "<div class='focal-stub' />" } }));

/** A fallen character's memorial with every field filled; override what a test is about. */
function memorial(overrides: Partial<CharacterMemorial> = {}): CharacterMemorial {
  return {
    id: "m1",
    party_member_id: "pm1",
    campaign_id: "c1",
    owner_user_id: "u1",
    marked_by: "dm",
    kind: "fallen",
    restored_at: null,
    game_date: "14 Mirtul 1492 DR",
    real_date: "2026-05-04",
    account: DOC("Chicory held the gate."),
    last_words: null,
    last_blow: "a giant wasp",
    survived_by: ["Fresco", "Rosie", "Vellum"],
    player_name: "Mira",
    character_name: "Chicory",
    portrait_url: null,
    portrait_focal_point: null,
    species_name: "Brewling",
    class_name: "Cleric",
    level: 6,
    campaign_name: "Sugarwell",
    created_at: "2026-05-04T10:00:00Z",
    updated_at: "2026-05-04T10:00:00Z",
    ...overrides,
  };
}

/** Mounts the card back side up for a bystander; props override the side and the viewer. */
function render(
  m: CharacterMemorial,
  props: { side?: "front" | "back"; viewer?: "owner" | "dm" | "other"; candleCount?: number; litByMe?: boolean } = {},
) {
  return mount(MemorialCard, {
    props: { memorial: m, side: "back", viewer: "other", candleCount: 0, litByMe: false, ...props },
  });
}

describe("MemorialCard front", () => {
  it("names the fallen in memoriam with a dagger and the game date", () => {
    const w = render(memorial(), { side: "front" });
    expect(w.text()).toContain("IN MEMORIAM");
    expect(w.text()).toContain("Chicory");
    expect(w.text()).toContain("Brewling cleric of the sixth level");
    expect(w.text()).toContain("†");
    expect(w.text()).toContain("14 Mirtul 1492 DR");
    expect(w.text()).toContain("Laid to rest 4 May 2026");
    expect(w.text()).not.toContain("Laid down arms");
  });

  it("names a retired character in honour, with no dagger", () => {
    const w = render(memorial({ kind: "retired" }), { side: "front" });
    expect(w.text()).toContain("IN HONOUR");
    expect(w.text()).toContain("Laid down arms");
    expect(w.text()).toContain("Retired 4 May 2026");
    expect(w.text()).not.toContain("†");
    expect(w.find(".mcard-sash").exists()).toBe(false);
  });

  it("falls back to the real date when the DM left the game date blank", () => {
    const w = render(memorial({ game_date: null }), { side: "front" });
    expect(w.find(".mcard-date").text()).toContain("4 May 2026");
  });

  it("emits flip from Turn over", async () => {
    const w = render(memorial(), { side: "front" });
    await w.get("[data-testid=turn-over]").trigger("click");
    expect(w.emitted("flip")).toHaveLength(1);
  });
});

describe("MemorialCard back", () => {
  it("is an obituary for the fallen", () => {
    const w = render(memorial());
    expect(w.text()).toContain("OBITUARY");
    expect(w.text()).toContain("fell on 14 Mirtul 1492 DR");
    expect(w.text()).toContain("How it happened");
    expect(w.get("[data-testid=last-blow]").text()).toBe("Struck down by a giant wasp.");
    expect(w.get("[data-testid=survived-by]").text()).toBe("Survived by Fresco, Rosie and Vellum.");
    expect(w.find("[data-testid=light-candle]").exists()).toBe(true);
  });

  it("is a tribute for the retired, without blow, survivors or candles", () => {
    const w = render(memorial({ kind: "retired" }));
    expect(w.text()).toContain("IN HONOUR");
    expect(w.text()).toContain("laid down arms on 14 Mirtul 1492 DR");
    expect(w.text()).toContain("How they left");
    expect(w.find("[data-testid=last-blow]").exists()).toBe(false);
    expect(w.find("[data-testid=survived-by]").exists()).toBe(false);
    expect(w.find("[data-testid=light-candle]").exists()).toBe(false);
  });

  it("renders the account as rich text, never as its stored JSON", () => {
    const w = render(memorial({ account: DOC("Trampled by a mammoth") }));
    expect(w.get("[data-testid=account]").text()).toBe("Trampled by a mammoth");
    expect(w.get("[data-testid=account]").text()).not.toContain('"type"');
  });

  it("puts the name on its own line, apart from the lineage", () => {
    const w = render(memorial());
    expect(w.get(".mcard-lead b").text()).toBe("Chicory");
    expect(w.get(".mcard-lead-line").text()).not.toContain("Chicory");
  });

  it("invites the owner to write last words when there are none", async () => {
    const w = render(memorial(), { viewer: "owner" });
    expect(w.text()).toContain("Their last words are yours to write.");
    expect(w.find("[data-testid=edit-words]").exists()).toBe(false);
    await w.get("[data-testid=write-words]").trigger("click");
    expect(w.emitted("edit-words")).toHaveLength(1);
  });

  it("gives the owner a quill on existing last words", async () => {
    const w = render(memorial({ last_words: DOC("Plant something.") }), { viewer: "owner" });
    expect(w.text()).toContain("Plant something.");
    expect(w.text()).not.toContain("yours to write");
    await w.get("[data-testid=edit-words]").trigger("click");
    expect(w.emitted("edit-words")).toHaveLength(1);
  });

  it("shows anyone else no last-words section at all when it is empty", () => {
    for (const viewer of ["other", "dm"] as const) {
      const w = render(memorial(), { viewer });
      expect(w.text()).not.toContain("Last words");
      expect(w.text()).not.toContain("yours to write");
    }
  });

  it("treats an emptied editor as no words", () => {
    const w = render(memorial({ last_words: DOC("") }), { viewer: "other" });
    expect(w.text()).not.toContain("Last words");
  });

  it("shows last words to others, signed, without a quill", () => {
    const w = render(memorial({ last_words: DOC("Plant something.") }), { viewer: "other" });
    expect(w.text()).toContain("Last words");
    expect(w.text()).toContain("Plant something.");
    expect(w.text()).toContain("Mira");
    expect(w.find("[data-testid=edit-words]").exists()).toBe(false);
  });

  it("labels the retired section Farewell", () => {
    const w = render(memorial({ kind: "retired", last_words: DOC("Teach them to parry.") }));
    expect(w.text()).toContain("Farewell");
    expect(w.text()).not.toContain("Last words");
  });

  it("gives only the DM a quill on the account", async () => {
    expect(render(memorial(), { viewer: "owner" }).find("[data-testid=edit-account]").exists()).toBe(false);
    expect(render(memorial(), { viewer: "other" }).find("[data-testid=edit-account]").exists()).toBe(false);
    const w = render(memorial(), { viewer: "dm" });
    await w.get("[data-testid=edit-account]").trigger("click");
    expect(w.emitted("edit-account")).toHaveLength(1);
  });

  it("counts candles and lets a viewer light one once", async () => {
    expect(render(memorial()).get("[data-testid=light-candle]").text()).toContain("Light a candle");
    expect(render(memorial(), { candleCount: 1 }).get("[data-testid=light-candle]").text()).toContain("1 candle");
    const three = render(memorial(), { candleCount: 3 });
    expect(three.get("[data-testid=light-candle]").text()).toContain("3 candles");
    await three.get("[data-testid=light-candle]").trigger("click");
    expect(three.emitted("light-candle")).toHaveLength(1);

    const lit = render(memorial(), { candleCount: 3, litByMe: true });
    await lit.get("[data-testid=light-candle]").trigger("click");
    expect(lit.emitted("light-candle")).toBeUndefined();
  });

  it("draws at most five candle icons", () => {
    const w = render(memorial(), { candleCount: 9 });
    expect(w.findAll(".mcard-candle-icon")).toHaveLength(5);
    expect(w.get("[data-testid=light-candle]").text()).toContain("9 candles");
  });
});
