import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { Connection } from "@/types/connections.types";

const m = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
const ties = ref<Connection[]>([]);
vi.mock("@/composables/canon/useForceWho", () => ({ useForceWhoTies: () => ({ ties, addWho: m.add, removeWho: m.remove }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([{ id: "n1", name: "Vexa" }]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([{ id: "f1", name: "The Ferrymen" }]) }) }));
vi.mock("@/composables/deities/useDeities", () => ({ useAllDeities: () => ({ data: ref([{ id: "d1", name: "Orrin" }]) }) }));

import ForceWhoPicker from "./ForceWhoPicker.vue";

const Combo = { name: "EntityCombobox", props: ["modelValue", "options"], emits: ["update:modelValue"], template: "<div />" };
const tie = (over: Partial<Connection>): Connection => ({
  source: "link", row_id: "r1", type: "about", outward: true, other_kind: "npc", other_id: "n1", other_name: "Vexa", other_image: null,
  note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null, ...over,
});
const mountIt = () => mount(ForceWhoPicker, { props: { forceId: "f9" }, global: { stubs: { EntityCombobox: Combo, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } } });

beforeEach(() => { ties.value = []; m.add.mockReset(); m.remove.mockReset(); });

describe("ForceWhoPicker", () => {
  // Bug caught (#1279 item 11): the picker offering only factions, or offering someone already named.
  it("offers every person, faction and god not already named", () => {
    ties.value = [tie({})];
    const options = mountIt().getComponent(Combo).props("options") as { id: string; label: string }[];
    expect(options.map((o) => [o.id, o.label])).toEqual([["faction:f1", "Faction"], ["deity:d1", "God"]]);
  });

  // Bug caught: the kind lost on the way to the write (an NPC's id written as a faction's), or the picker keeping its pick.
  it("adds the picked one with its own kind and clears the picker", async () => {
    const w = mountIt();
    w.getComponent(Combo).vm.$emit("update:modelValue", "deity:d1");
    await flushPromises();
    expect(m.add).toHaveBeenCalledExactlyOnceWith({ kind: "deity", id: "d1", name: "Orrin" });
    expect(w.getComponent(Combo).props("modelValue")).toBe("");
  });

  it("names each who as a link to its page and takes one off", async () => {
    ties.value = [tie({ other_kind: "faction", other_id: "f1", other_name: "The Ferrymen" })];
    const w = mountIt();
    expect(w.get("[data-testid=force-who-name]").attributes("href")).toBe("/factions/f1");
    await w.get("button[aria-label='The Ferrymen is not behind this']").trigger("click");
    expect(m.remove).toHaveBeenCalledWith(ties.value[0]);
  });
});
