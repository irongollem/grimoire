import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import type { CanonHere, CanonHereEntry } from "@/composables/canon/useCanonHere";

const mocks = vi.hoisted(() => ({ createEntry: vi.fn(), connect: vi.fn(), push: vi.fn(), toastError: vi.fn(), tellParty: vi.fn() }));
// What is tied to this person, and the told counts, are `get_canon_here`'s (canon_story_shape.test.sql).
const here = ref<CanonHere>({ clues: [], passages: [], lore: [], knows: [], about: [] });

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }), RouterLink: { props: ["to"], template: "<a :href=\"to.query.entry\"><slot /></a>" } }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : "?") } }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnection: () => ({ mutateAsync: mocks.connect }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }) }));
vi.mock("@/composables/canon/useCanonHere", () => ({ useCanonHere: () => ({ data: computed(() => here.value) }) }));
vi.mock("@/composables/canon/useTellTruth", () => ({ useTellTruth: () => ({ tellParty: mocks.tellParty }) }));

import NpcInCanon from "./NpcInCanon.vue";

const entry = (over: Partial<CanonHereEntry>): CanonHereEntry => ({ id: "t1", title: "The bridge was never built", part: "truth", knowledge: "some", revealed_at: null, ...over });
const mountIt = () =>
  mount(NpcInCanon, {
    props: { npcId: "n1", name: "Maera" },
    global: { stubs: { CanonHere: { props: ["kind", "id", "bare"], template: "<div data-testid='canon-here' :data-bare='bare' />" }, AppButton: { props: ["label"], emits: ["click"], template: "<button @click=\"$emit('click')\">{{ label }}</button>" } } },
  });

describe("NpcInCanon", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    here.value = { clues: [], passages: [], lore: [], knows: [], about: [] };
  });

  // Bug (#1279 item 13): what an NPC can tell was invisible from their sheet, or listed under About them.
  it("lists what they know under Knows and what is about them under About them, each opening its entry", () => {
    here.value = { ...here.value, knows: [entry({ id: "k1", title: "The ferrymen lie" })], about: [entry({ id: "a1", title: "Maera is the Warden", part: "secret", knowledge: null })] };
    const w = mountIt();
    expect(w.get("[data-testid=npc-knows-row] a").attributes("href")).toBe("k1");
    expect(w.get("[data-testid=npc-about-row] a").attributes("href")).toBe("a1");
    expect(w.find("[data-testid=npc-knows]").text()).not.toContain("Warden");
  });

  // Bug: the block showed no count of what is told, or did not link the entry.
  it("lists the lore told of this person under About them, each with how many passages are told", () => {
    here.value = { ...here.value, lore: [{ id: "l1", title: "The Fall of the Mere", told: 2, total: 3 }] };
    const row = mountIt().get("[data-testid=npc-lore-row]");
    expect(row.get("[data-testid=npc-lore-told]").text()).toContain("2 of 3 told");
    expect(row.get("a").attributes("href")).toBe("l1");
  });

  // Bug: "Tell the party" offered on a secret, a force, or a truth already told to all.
  it("offers Tell the party only on a truth they know that is not yet told to everyone, and tells that truth", async () => {
    here.value = {
      ...here.value,
      knows: [entry({ id: "t1" }), entry({ id: "t2", knowledge: "all", revealed_at: "2026-11-01T00:00:00Z" }), entry({ id: "s1", part: "secret", knowledge: null })],
    };
    const w = mountIt();
    const buttons = w.findAll("[data-testid=npc-tell]");
    expect(buttons).toHaveLength(1);
    await buttons[0]!.trigger("click");
    expect(mocks.tellParty).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    expect(w.find("[data-testid=npc-told]").exists()).toBe(true);
  });

  // Bug: the clues and passages on them dropped out when the block replaced "Canon here" on the sheet.
  it("holds the clues and passages on them (Canon here, without its card) only when there are some", () => {
    expect(mountIt().find("[data-testid=npc-on-them]").exists()).toBe(false);
    here.value = { ...here.value, clues: [{ id: "c", title: "A torn ledger", secret_id: "s", secret_title: "S", found_at: null, found_session_id: null }] };
    const w = mountIt();
    expect(w.find("[data-testid=npc-on-them]").exists()).toBe(true);
    expect(w.get("[data-testid=canon-here]").attributes("data-bare")).toBeDefined();
  });

  it("says so when nothing in the canon is tied to them", () => {
    expect(mountIt().get("[data-testid=npc-canon-none]").text()).toContain("Maera");
  });

  // Bug: the button made an entry that was not tied to the person, or did not land on it.
  it("writes lore about the person: makes the entry, ties it about them and lands on it", async () => {
    mocks.createEntry.mockResolvedValue({ id: "new1" });
    mocks.connect.mockResolvedValue(undefined);
    await mountIt().get("[data-testid=write-lore]").trigger("click");
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.createEntry).toHaveBeenCalledWith({ part: "lore", title: "Lore about Maera" });
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({
      subject: { kind: "canon", id: "new1" },
      other: { kind: "npc", id: "n1", name: "Maera" },
      choice: expect.objectContaining({ key: "about", subjectIsFrom: true }),
    }));
    expect(mocks.push).toHaveBeenCalledWith({ path: "/canon", query: { entry: "new1" } });
  });

  // Bug: a failed tie lost the new entry (no navigation, no word), leaving an orphan the DM never finds.
  it("still lands on the entry when the tie fails, and says so", async () => {
    mocks.createEntry.mockResolvedValue({ id: "new1" });
    mocks.connect.mockRejectedValue(new Error("nope"));
    await mountIt().get("[data-testid=write-lore]").trigger("click");
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith({ path: "/canon", query: { entry: "new1" } }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("not tied to Maera"));
  });

  // Bug: a failed create navigated to a lore entry that does not exist.
  it("does not navigate when the entry could not be made", async () => {
    mocks.createEntry.mockRejectedValue(new Error("no"));
    await mountIt().get("[data-testid=write-lore]").trigger("click");
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
