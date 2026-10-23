import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { nextTick } from "vue";
import { buildBookModel } from "@/lib/openBook/bookModel";
import { sectionsOf } from "@/lib/openBook/sections";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import BookSlip from "./BookSlip.vue";

const snapshot: OpenBookSnapshot = {
  v: 1,
  book: { title: "T", subtitle: null, cover_art: "tooled", cover_image_url: null, leather: "oxblood", chapters: ["atlas"], campaign_name: "C" },
  calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
  places: [
    { id: "town", parent_id: null, name: "Hollowmere", location_type: null, player_summary: null, description: null, image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
    { id: "stair", parent_id: null, name: "Toll Stair", location_type: null, player_summary: null, description: null, image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
  ],
  folk: [], factions: [], pantheons: [], deities: [], lore: [], sessions: [], events: [], names: {},
};
const model = buildBookModel(snapshot);

async function mountSlip(withContents: boolean) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/w/:slug/:chapter/:entryId", name: "open-book-entry", component: { template: "<div />" } },
      { path: "/w/:slug/:chapter", name: "open-book-chapter", component: { template: "<div />" } },
      { path: "/w/:slug/contents", name: "open-book-contents", component: { template: "<div />" } },
      { path: "/w/:slug/index", name: "open-book-index", component: { template: "<div />" } },
    ],
  });
  await router.push("/w/s/contents");
  return mount(BookSlip, {
    props: { open: false, model, sections: sectionsOf(model), slug: "s", ribbons: [], withContents },
    global: { plugins: [router] },
    attachTo: document.body,
  });
}

describe("BookSlip", () => {
  it("finds entries by name and links to them", async () => {
    const w = await mountSlip(false);
    await w.setProps({ open: true });
    await nextTick();
    await w.find("input").setValue("toll");
    const hits = w.findAll("a.ob-slip-hit");
    expect(hits).toHaveLength(1);
    expect(hits[0].text()).toContain("Toll Stair");
    expect(hits[0].attributes("href")).toBe("/w/s/atlas/stair");
    w.unmount();
  });

  it("says so when nothing matches", async () => {
    const w = await mountSlip(false);
    await w.find("input").setValue("zzz");
    expect(w.text()).toContain("Nothing in this book goes by that name.");
    w.unmount();
  });

  it("carries the contents on a phone, and not on a wide screen", async () => {
    const phone = await mountSlip(true);
    expect(phone.text()).toContain("The Atlas");
    expect(phone.text()).toContain("Index of names");
    phone.unmount();
    const wide = await mountSlip(false);
    expect(wide.text()).not.toContain("Index of names");
    wide.unmount();
  });

  it("asks to close from the close button", async () => {
    const w = await mountSlip(false);
    await w.find(".ob-slip-close").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
  });
});
