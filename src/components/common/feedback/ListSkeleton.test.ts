import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ListSkeleton from "./ListSkeleton.vue";

// A thumbnail or picture block is what a low-art page must not promise (#1179).
const PICTURE_SHAPES = ".size-14, .size-12, .aspect-4\\/5, .h-36";

describe("ListSkeleton low-art phone variants", () => {
  it.each(["rows-text", "cards-text"] as const)(
    "%s draws one card per count and no picture-shaped block",
    (variant) => {
      const wrapper = mount(ListSkeleton, { props: { variant, count: 5 } });
      // Fails if the variant falls through to the portrait-promising default grid card.
      expect(wrapper.findAll(".rounded-xl.border")).toHaveLength(5);
      expect(wrapper.find(PICTURE_SHAPES).exists()).toBe(false);
    },
  );

  it("cards-text lays out two-up like the phone grid", () => {
    const wrapper = mount(ListSkeleton, { props: { variant: "cards-text", count: 4 } });
    expect(wrapper.get("[role=status]").classes()).toContain("grid-cols-2");
  });
});
