import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref, toValue } from "vue";
import { mount } from "@vue/test-utils";
import type { SearchGroup } from "@/composables/useGlobalSearch";

const mocks = vi.hoisted(() => ({
  groups: [] as SearchGroup[],
  seenKinds: [] as unknown[],
}));

vi.mock("@/composables/useGlobalSearch", () => ({
  useGlobalSearch: (_query: unknown, options: { kinds: unknown }) => {
    return {
      data: computed(() => { mocks.seenKinds.push(toValue(options.kinds as never)); return { groups: mocks.groups, failedGroups: [] }; }),
      isFetching: ref(false),
      isError: ref(false),
      isSemanticPending: ref(false),
      thumbnails: ref({}),
    };
  },
}));

const ListStub = defineComponent({
  props: { groups: { type: Array, required: true }, exclude: { type: Object, default: null }, selectable: { type: Boolean, default: false } },
  emits: ["pick"],
  setup(props, { emit }) {
    return () => h("div", { "data-testid": "list", "data-selectable": String(props.selectable) }, [
      (props.groups as SearchGroup[]).map((g) => g.items.map((i) => h("button", { key: i.id, onClick: () => emit("pick", { kind: i.kind ?? g.type, id: i.id, name: i.name }) }, i.name))),
    ]);
  },
});

import WorldEntityPicker from "./WorldEntityPicker.vue";

const UUID = "11111111-1111-4111-8111-111111111111";

function render(props: Record<string, unknown> = {}) {
  return mount(WorldEntityPicker, { props, global: { stubs: { SearchResultList: ListStub } } });
}

beforeEach(() => {
  mocks.seenKinds = [];
  mocks.groups = [
    { type: "npc", label: "NPCs", items: [{ id: "n1", name: "Harl", route: "/npcs/n1", matchedBy: "name", kind: "npc" }, { id: "n2", name: "Brenna", route: "/npcs/n2", matchedBy: "name", kind: "npc" }] },
    { type: "item", label: "Vault", items: [{ id: UUID, name: "Toll horn", route: "/vault/x", matchedBy: "name", kind: "item" }, { id: "srd_rope", name: "Rope", route: "/vault/srd_rope", matchedBy: "meaning", kind: "item" }] },
    { type: "quest", label: "Quests", items: [{ id: "q1", name: "A Quest", route: "/quests/q1", matchedBy: "name", kind: "quest" }] },
  ];
});

describe("WorldEntityPicker", () => {
  it("asks for a query before it searches", () => {
    const wrapper = render();
    expect(wrapper.text()).toContain("Type a name");
    expect(wrapper.find("[data-testid=list]").exists()).toBe(false);
  });

  it("lists only kinds that can hold a link, leaves out the subject and shared-library items", async () => {
    const wrapper = render({ subject: { kind: "npc", id: "n1" } });
    await wrapper.find("input").setValue("ha");
    const names = wrapper.findAll("[data-testid=list] button").map((b) => b.text());
    expect(names).toEqual(["Brenna", "Toll horn"]);
  });

  it("emits pick with kind, id and name, and the list is in picker mode", async () => {
    const wrapper = render();
    await wrapper.find("input").setValue("ha");
    expect(wrapper.find("[data-testid=list]").attributes("data-selectable")).toBe("true");
    await wrapper.findAll("[data-testid=list] button")[0].trigger("click");
    expect(wrapper.emitted("pick")).toEqual([[{ kind: "npc", id: "n1", name: "Harl" }]]);
  });

  it("narrows the search to one kind from a chip, and back to all", async () => {
    const wrapper = render({ kinds: ["npc", "faction", "location"] });
    await wrapper.find("input").setValue("ha");
    const chip = wrapper.findAll("button").find((b) => b.text() === "Factions");
    await chip?.trigger("click");
    expect(mocks.seenKinds.at(-1)).toEqual(["faction"]);
    await wrapper.findAll("button").find((b) => b.text() === "All")?.trigger("click");
    expect(mocks.seenKinds.at(-1)).toEqual(["npc", "faction", "location"]);
  });

  it.each(["h", "   ", " h "])("shows no results for %j: a single letter, even padded with spaces, is not a search", async (typed) => {
    const wrapper = render();
    await wrapper.find("input").setValue(typed);
    expect(wrapper.find("[data-testid=list]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Type a name");
  });

  it("only hides the subject itself: another kind of thing with the same id is still offered", async () => {
    const wrapper = render({ subject: { kind: "faction", id: "n1" } });
    await wrapper.find("input").setValue("ha");
    expect(wrapper.findAll("[data-testid=list] button").map((b) => b.text())).toContain("Harl");
  });

  it("takes an item's own kind over its group's, so a mixed group still offers what can be linked", async () => {
    mocks.groups = [
      { type: "quest", label: "Mixed", items: [{ id: "n9", name: "Corva", route: "/npcs/n9", matchedBy: "name", kind: "npc" }] },
    ];
    const wrapper = render();
    await wrapper.find("input").setValue("co");
    expect(wrapper.findAll("[data-testid=list] button").map((b) => b.text())).toEqual(["Corva"]);
  });
});
