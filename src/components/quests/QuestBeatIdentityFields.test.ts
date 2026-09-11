import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestBeatIdentityFields from "./QuestBeatIdentityFields.vue";
import type { QuestBeat } from "@/types/quest.types";

function beat(overrides: Partial<QuestBeat> = {}): QuestBeat {
  return {
    id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "Confront Ser Vallis",
    dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
    rumor_text: null, reveal_text: null, visibility: "rumored", kind: "social",
    presentation_hint: null, staged_at_location_id: null, canvas_x: 0, canvas_y: 0, is_improvised: false,
    improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "version-1",
    ...overrides,
  };
}

function mountFields(overrides: Partial<InstanceType<typeof QuestBeatIdentityFields>["$props"]> = {}) {
  return mount(QuestBeatIdentityFields, {
    props: {
      beat: beat(),
      kindOptions: ["neutral", "combat", "social", "explore", "discovery"],
      locationOptions: [],
      stagedLocationName: "",
      stagedSiteCaption: "nowhere yet",
      kind: "social",
      visibility: "rumored",
      stagedLocationId: "",
      "onUpdate:kind": () => {},
      "onUpdate:visibility": () => {},
      "onUpdate:stagedLocationId": () => {},
      ...overrides,
    },
    global: { stubs: { EntityCombobox: true } },
  });
}

describe("QuestBeatIdentityFields", () => {
  it("shows every kind option, labelled, with the current one selected", () => {
    const wrapper = mountFields({ kind: "explore" });
    const select = wrapper.get('select[aria-label="Kind"]');
    expect(select.findAll("option").map((option) => option.text())).toEqual(["Neutral", "Combat", "Social", "Explore", "Discovery"]);
    expect((select.element as HTMLSelectElement).value).toBe("explore");
  });

  it("emits update:kind when the Kind select changes", async () => {
    const wrapper = mountFields();
    await wrapper.get('select[aria-label="Kind"]').setValue("combat");
    expect(wrapper.emitted("update:kind")).toEqual([["combat"]]);
  });

  it("keeps the visibility select hidden until Edit is clicked, then emits and closes it again", async () => {
    const wrapper = mountFields({ visibility: "hidden" });
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(false);

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Edit")!.trigger("click");
    const select = wrapper.get('select[aria-label="Player visibility"]');
    await select.setValue("revealed");

    expect(wrapper.emitted("update:visibility")).toEqual([["revealed"]]);
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(false);
  });

  it("keeps the location combobox hidden until Change is clicked, then emits and closes it again", async () => {
    const wrapper = mountFields();
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Change")!.trigger("click");
    const combobox = wrapper.findComponent({ name: "EntityCombobox" });
    expect(combobox.exists()).toBe(true);
    await combobox.vm.$emit("update:modelValue", "loc-2");

    expect(wrapper.emitted("update:stagedLocationId")).toEqual([["loc-2"]]);
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
  });

  it("shows the staged location name and caption, or the unstaged fallback", () => {
    const unstaged = mountFields();
    expect(unstaged.text()).toContain("Not staged");
    expect(unstaged.text()).toContain("staged at · nowhere yet");

    const staged = mountFields({ stagedLocationName: "Ashmouth Chapel", stagedSiteCaption: "site: 2 rooms" });
    expect(staged.text()).toContain("Ashmouth Chapel");
    expect(staged.text()).toContain("staged at · site: 2 rooms");
  });

  it("resets both editing toggles back closed when the beat changes", async () => {
    const wrapper = mountFields({ beat: beat({ id: "beat-1" }) });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Edit")!.trigger("click");
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Change")!.trigger("click");
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(true);

    await wrapper.setProps({ beat: beat({ id: "beat-2" }) });
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
  });
});
