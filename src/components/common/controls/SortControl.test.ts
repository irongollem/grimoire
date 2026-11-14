import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SortControl from "./SortControl.vue";
import type { SortOption } from "@/lib/sortOptions";

const OPTIONS = [
  { value: "created", label: "Created", order: "date" },
  { value: "manual", label: "Manual", order: "fixed" },
] as const satisfies readonly SortOption<"created" | "manual">[];

const REVERSE = '[aria-label$="Click to reverse."]';

function mountControl(sortBy: string, sortDir?: "asc" | "desc") {
  return mount(SortControl, {
    props: { options: OPTIONS, sortBy, ...(sortDir ? { sortDir, "onUpdate:sortDir": () => {} } : {}) },
  });
}

describe("SortControl", () => {
  it("says the direction in the field's words and reverses it from its own button", async () => {
    const w = mountControl("created", "desc");
    const button = w.find(REVERSE);
    expect(button.attributes("aria-label")).toBe("Newest first. Click to reverse.");
    await button.trigger("click");
    expect(w.emitted("update:sortDir")).toEqual([["asc"]]);
  });

  // A hand-made order has nothing to reverse, so a button there would do nothing.
  it("offers no direction for a field with a fixed order", () => {
    expect(mountControl("manual", "desc").find(REVERSE).exists()).toBe(false);
  });

  // A provider's ranking keeps no direction at all: the list leaves sortDir unbound.
  it("offers no direction when the list keeps none", () => {
    expect(mountControl("created").find(REVERSE).exists()).toBe(false);
  });
});
