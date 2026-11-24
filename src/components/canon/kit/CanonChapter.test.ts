import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonChapter from "./CanonChapter.vue";

const mountChapter = (open: boolean) =>
  mount(CanonChapter, {
    props: { chapter: "truths", title: "Truths", why: "What is simply so.", open, backLabel: "Truths" },
    slots: { toolbar: "<i data-testid='tb' />", default: "<ul data-testid='rows' />", add: "<i data-testid='add' />", entry: "<p data-testid='entry'>the entry</p>" },
  });

describe("CanonChapter", () => {
  // Bug caught: the entry drawn with no list beside it, or the list column dropped, so the DM lost their place.
  it("draws the list column with its head, toolbar, rows and add row, and no entry until one is open", () => {
    const w = mountChapter(false);
    expect(w.get("h2").text()).toBe("Truths");
    expect(w.text()).toContain("What is simply so.");
    for (const id of ["tb", "rows", "add"]) expect(w.find(`[data-testid=${id}]`).exists()).toBe(true);
    expect(w.find("#canon-inline-detail").exists()).toBe(false);
    expect(w.find("[data-testid=entry]").exists()).toBe(false);
  });

  // Bug caught: the page scrolling to a wrapper that is gone, because the entry lost the id CanonView looks for.
  it("holds the open entry in #canon-inline-detail", () => {
    const w = mountChapter(true);
    expect(w.get("#canon-inline-detail [data-testid=entry]").text()).toBe("the entry");
  });

  // Bug caught: below 56rem an open entry shown over the whole list (two screens at once), or the list kept when no entry is open.
  it("keeps the list on screen at 56rem and up only while an entry is open, and hides it below that", () => {
    expect(mountChapter(true).get("[data-testid=canon-chapter-list]").classes()).toEqual(expect.arrayContaining(["hidden", "@4xl:flex"]));
    expect(mountChapter(false).get("[data-testid=canon-chapter-list]").classes()).not.toContain("hidden");
  });

  // Bug caught: a narrow entry with no way back to its list, since the list is hidden behind it.
  it("offers Back to the chapter's name, which asks the page to close the entry, and only on a narrow chapter", async () => {
    const w = mountChapter(true);
    const back = w.get("[data-testid=canon-chapter-back]");
    expect(back.text()).toBe("Back to Truths");
    expect(back.classes()).toContain("@4xl:hidden");
    await back.trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
    expect(mountChapter(false).find("[data-testid=canon-chapter-back]").exists()).toBe(false);
  });
});
