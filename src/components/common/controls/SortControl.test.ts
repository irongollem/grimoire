import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SortControl from "./SortControl.vue";

const OPTIONS = [
  { value: "created", label: "Created" },
  { value: "manual", label: "Manual" },
] as const;

function mountControl(sortBy: string) {
  return mount(SortControl, {
    props: {
      options: OPTIONS,
      sortBy,
      sortDir: "desc" as const,
      "onUpdate:sortDir": () => {},
    },
  });
}

describe("SortControl", () => {
  it("reverses the direction from its own toggle", async () => {
    const w = mountControl("created");
    await w.find('[aria-label="Descending: click to reverse"]').trigger("click");
    expect(w.emitted("update:sortDir")).toEqual([["asc"]]);
  });

  // A hand-made order has no direction, so a toggle there would do nothing visible.
  it("offers no direction for a manual order", () => {
    expect(mountControl("manual").find('[aria-label$="click to reverse"]').exists()).toBe(false);
  });
});
