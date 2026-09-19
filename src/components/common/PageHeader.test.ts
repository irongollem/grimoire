import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PageHeader from "./PageHeader.vue";

describe("PageHeader", () => {
  it("keeps ordinary detail pages on the page body scroller", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Quest" },
      slots: { default: "Details" },
    });

    expect(wrapper.get('[data-testid="page-body"]').classes()).toContain("lg:overflow-y-auto");
  });

  it("lets contained workspaces own their internal desktop scrolling", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Quest", contained: true },
      slots: { default: "Graph" },
    });

    const body = wrapper.get('[data-testid="page-body"]');
    expect(body.classes()).toContain("lg:overflow-hidden");
    expect(body.classes()).not.toContain("lg:overflow-y-auto");
  });

  // A crowded action row used to refuse to give up any width, so the title
  // column absorbed 100% of the overflow and rendered one letter per line at
  // ~1100px. `lg:flex-1` on the title plus dropping `lg:shrink-0` from the
  // actions column is what lets the actions wrap instead — both are the kind
  // of class an unrelated change removes without noticing.
  it("lets the title column claim its share of row width instead of collapsing", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Quest" },
      slots: { actions: "<button>Action</button>" },
    });

    const titleWrapper = wrapper.get("h1").element.parentElement!;
    expect(titleWrapper.className).toContain("lg:flex-1");
  });

  it("lets the actions column wrap instead of refusing to shrink", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Quest" },
      slots: { actions: "<button>Action</button>" },
    });

    const actionsWrapper = wrapper.get("button").element.parentElement!;
    expect(actionsWrapper.className).toContain("flex-wrap");
    expect(actionsWrapper.className).not.toContain("lg:shrink-0");
  });
});
