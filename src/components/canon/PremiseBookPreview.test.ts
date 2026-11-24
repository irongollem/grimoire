import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { CanonEntry } from "@/types/canon.types";
import PremiseBookPreview from "./PremiseBookPreview.vue";

const e = (over: Partial<CanonEntry>): CanonEntry => canonEntry({ id: "x", campaign_id: "c1", part: "premise", premise_kind: "theme", player_visible_to: ["m1"], ...over });
const show = (entries: CanonEntry[]) => mount(PremiseBookPreview, { props: { entries } });

describe("PremiseBookPreview", () => {
  // Bug caught: an unshared theme or table note printed in the players' book.
  it("lists only what is shared with some party member", () => {
    const w = show([e({ id: "1", title: "Sweet spoils" }), e({ id: "2", title: "Secret theme", player_visible_to: [] }), e({ id: "3", premise_kind: "table", title: "Talk over fights" })]);
    expect(w.text()).toContain("Sweet spoils");
    expect(w.text()).toContain("Talk over fights");
    expect(w.text()).not.toContain("Secret theme");
  });

  // Bug caught: the voice and the look, which are written for the AI, appearing on the printed page.
  it("never prints the voice or the look, even when they carry a share", () => {
    const w = show([e({ id: "v", premise_kind: "voice", title: "Dry and warm" }), e({ id: "l", premise_kind: "look", title: "Gouache" })]);
    expect(w.text()).not.toContain("Dry and warm");
    expect(w.text()).not.toContain("Gouache");
    expect(w.find("[data-testid=premise-book-empty]").exists()).toBe(true);
  });

  // Bug caught: lines and veils put under the themes heading instead of "At our table".
  it("sets themes under what the campaign is about and table notes, lines and veils under At our table", () => {
    const w = show([e({ id: "1", title: "Kindness" }), e({ id: "2", premise_kind: "line", title: "No harm to children" }), e({ id: "3", premise_kind: "veil", title: "Deaths" })]);
    const about = w.findAll("section").find((s) => s.text().startsWith("What this campaign is about"))!;
    const table = w.findAll("section").find((s) => s.text().startsWith("At our table"))!;
    expect(about.text()).toContain("Kindness");
    expect(about.text()).not.toContain("No harm");
    expect(table.text()).toContain("No harm to children");
    expect(table.text()).toContain("Deaths");
  });

  it("prints the shared pitch's words, and says only what is shared prints", () => {
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A winter that will not end." }] }] });
    const w = show([e({ id: "p", premise_kind: "pitch", title: "", body })]);
    expect(w.get("[data-testid=premise-book-pitch]").text()).toBe("A winter that will not end.");
    expect(w.text()).toContain("Only what you share prints.");
  });
});
