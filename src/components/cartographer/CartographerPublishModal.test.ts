import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import CartographerPublishModal from "./CartographerPublishModal.vue";
import type { PublishPlan } from "@/lib/locations/publish";
import type { PublishReview } from "@/composables/cartographer/useMapPublish";
import type { Location } from "@/types/location.types";

const stubs = {
  AppModal: { template: "<div><slot /></div>" },
  ModalHeader: { template: "<div><slot name='actions' /></div>" },
  EntityCombobox: true,
  PaywallModal: true,
  PublishPlanPreview: true,
  PublishPlanRows: true,
};

function planWith(summary: Partial<PublishPlan["summary"]> = {}): PublishPlan {
  return {
    spaces: [],
    ways: [],
    placements: [],
    summary: {
      newRooms: 0,
      boundRooms: 0,
      regionUpdates: 0,
      newDoors: 0,
      doorUpdates: 0,
      heldSpaces: 0,
      heldWays: 0,
      orphans: 0,
      reanchored: 0,
      ...summary,
    },
  };
}

function mountModal(
  plan: PublishPlan | null,
  extra: { review?: Partial<PublishReview>; target?: Location | null; targetSiteId?: string } = {},
) {
  const review: PublishReview = { plan, bakedDims: null, mapRev: 2, publishing: false, error: null, quotaExceeded: false, ...extra.review };
  return mount(CartographerPublishModal, {
    props: {
      modelValue: true,
      targetSiteId: extra.targetSiteId ?? "site-1",
      siteContext: { options: [], target: extra.target ?? null, spaceNameById: new Map(), stairTargetOptions: [] },
      stairTargets: {},
      review,
    },
    global: { stubs },
  });
}

function publishButton(wrapper: ReturnType<typeof mountModal>) {
  const button = wrapper.findAllComponents({ name: "AppButton" }).find((b) => String(b.props("label")).startsWith("Publish"));
  if (!button) throw new Error("no Publish button");
  return button;
}

describe("CartographerPublishModal", () => {
  it("publishes a picture-only change: the image is a write of its own (#1073)", () => {
    const wrapper = mountModal(planWith());
    const button = publishButton(wrapper);
    expect(button.props("label")).toBe("Publish 1 change");
    expect(button.props("disabled")).toBe(false);
    expect(wrapper.text()).toContain("Writes 1 image.");
  });

  it("counts the structure and the image alike, so the button and the footer name the same number", () => {
    const wrapper = mountModal(planWith({ newRooms: 2, newDoors: 1 }));
    expect(publishButton(wrapper).props("label")).toBe("Publish 4 changes");
    expect(wrapper.text()).toContain("Writes 2 rooms, 1 door, 1 image.");
  });
  it("words each write by its count: singular and plural, existing rooms placed, doors new and changed together", () => {
    const wrapper = mountModal(planWith({ newRooms: 1, boundRooms: 2, regionUpdates: 1, newDoors: 1, doorUpdates: 2, reanchored: 3 }));
    expect(wrapper.text()).toContain(
      "Writes 1 room, 2 existing rooms placed, 1 region update, 3 doors, 3 placements re-anchored, 1 image.",
    );
    expect(publishButton(wrapper).props("label")).toBe("Publish 11 changes");
    expect(wrapper.text()).not.toContain("1 existing room placed");
  });

  it("calls the parts of a wilds site grounds, not rooms", () => {
    const wilds = { location_type: "wilds", name: "Thornwood" } as Location;
    const wrapper = mountModal(planWith({ newRooms: 2, boundRooms: 1 }), { target: wilds });
    expect(wrapper.text()).toContain("Writes 2 grounds, 1 existing grounds placed, 1 image.");
  });

  it("will not publish before there is a plan or while a publish is running, and says so while it runs", () => {
    const none = mountModal(null);
    expect(publishButton(none).props("disabled")).toBe(true);
    const running = mountModal(planWith(), { review: { publishing: true } });
    expect(publishButton(running).props("disabled")).toBe(true);
    expect(running.findAllComponents({ name: "AppButton" }).some((b) => b.props("label") === "Publishing…")).toBe(true);
  });

  it("asks which place to publish to when none is chosen, and shows the chosen place otherwise", () => {
    const unchosen = mountModal(planWith(), { targetSiteId: "" });
    expect(unchosen.text()).toContain("Pick a place to publish this map to.");
    expect(unchosen.findComponent({ name: "EntityCombobox" }).exists()).toBe(true);
    const chosen = mountModal(planWith(), { target: { location_type: "dungeon", name: "Sunken Vault" } as Location });
    expect(chosen.text()).toContain("Sunken Vault");
    expect(chosen.text()).not.toContain("Pick a place");
  });

  it("opens the place picker from Change place and closes it again once a place is picked", async () => {
    const wrapper = mountModal(planWith(), { target: { location_type: "dungeon", name: "Sunken Vault" } as Location });
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Change place…")!.trigger("click");
    const picker = wrapper.findComponent({ name: "EntityCombobox" });
    expect(picker.exists()).toBe(true);
    picker.vm.$emit("update:modelValue", "site-2");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:targetSiteId")).toEqual([["site-2"]]);
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
  });

  it("opens the paywall when the publish was refused for quota", async () => {
    const wrapper = mountModal(planWith());
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(false);
    await wrapper.setProps({ review: { plan: planWith(), bakedDims: null, mapRev: 2, publishing: false, error: null, quotaExceeded: true } });
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("asks to publish when the button is pressed", async () => {
    const wrapper = mountModal(planWith());
    await publishButton(wrapper).trigger("click");
    expect(wrapper.emitted("publish")).toHaveLength(1);
  });
});
