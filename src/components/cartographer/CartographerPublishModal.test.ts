import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import CartographerPublishModal from "./CartographerPublishModal.vue";
import type { PublishPlan } from "@/lib/locations/publish";
import type { PublishReview } from "@/composables/cartographer/useMapPublish";

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

function mountModal(plan: PublishPlan) {
  const review: PublishReview = { plan, bakedDims: null, mapRev: 2, publishing: false, error: null, quotaExceeded: false };
  return mount(CartographerPublishModal, {
    props: {
      modelValue: true,
      targetSiteId: "site-1",
      siteContext: { options: [], target: null, spaceNameById: new Map(), stairTargetOptions: [] },
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
});
