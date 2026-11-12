// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScriptoriumBookSettings from "./ScriptoriumBookSettings.vue";
import type { BookSettingsDraft } from "@/scriptorium/composables/useBookSettings";

const draft: BookSettingsDraft = {
  title: "Sothery", kind: "book", campaignId: null, theme: "onednd2024", pageSize: "A4", isTwoColumn: true,
  inkFriendly: false, showPageNumbers: true, pageNumberStart: 1, footerText: "", footerTitle: "chapter",
  footerStyle: "plain", paperTone: null, isPublished: false, tags: [], furniture: [],
};

function open(over: Partial<BookSettingsDraft> = {}) {
  return mount(ScriptoriumBookSettings, {
    props: { open: true, draft: { ...draft, ...over }, chapterCount: 1, campaignOptions: [], status: "saved" },
    global: { stubs: { AppModal: { template: "<div><slot /></div>" }, ModalHeader: true, TagInput: true } },
  });
}

const click = (w: ReturnType<typeof open>, label: string) =>
  w.findAll("button").find((b) => b.text() === label)!.trigger("click");
const paperGroup = (w: ReturnType<typeof open>) => w.find('[role="radiogroup"][aria-label="Paper"]');

describe("ScriptoriumBookSettings paper and footer", () => {
  // Fails on: the paper choice patching its label ("Grey") instead of the column's value.
  it("writes the chosen paper, and null for the look's own", async () => {
    const w = open({ paperTone: "grey" });
    await click(w, "Parchment");
    await click(w, "Look's own");
    expect(w.emitted("patch")).toEqual([[{ paperTone: "parchment" }], [{ paperTone: null }]]);
  });

  // Fails on: the paper choice staying books-only, so a handout cannot be written on a kraft sheet.
  it("offers the same paper choice for a handout, with the look's own first", () => {
    const w = open({ kind: "handout", theme: "letter" });
    const labels = paperGroup(w).findAll("button").map((b) => b.text());
    expect(labels[0]).toBe("Look's own");
    expect(labels).toContain("Kraft");
    expect(labels).toHaveLength(13);
  });

  it("writes the footer style", async () => {
    const w = open();
    await click(w, "Ribbon");
    expect(w.emitted("patch")).toEqual([[{ footerStyle: "ribbon" }]]);
  });
});
