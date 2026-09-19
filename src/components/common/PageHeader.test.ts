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

  // A crowded action row used to refuse to give up any width while the title
  // column could shrink to zero, so the title absorbed 100% of the overflow
  // and rendered one letter per line at ~1100px. The fix is three classes that
  // only work together — the row wraps, the title does not shrink, and the
  // actions keep a content-sized basis so they are what wraps. Any one of them
  // going missing restores the bug quietly, hence a test per class.
  const headerWithActions = () =>
    mount(PageHeader, {
      props: { title: "Quest" },
      slots: { actions: "<button>Action</button>" },
    });

  it("wraps the header row rather than squeezing the title", () => {
    const row = headerWithActions().get("h1").element.parentElement!.parentElement!;
    expect(row.className).toContain("lg:flex-wrap");
  });

  it("keeps the title at the width its own text needs", () => {
    const titleWrapper = headerWithActions().get("h1").element.parentElement!;
    expect(titleWrapper.className).toContain("lg:shrink-0");
  });

  it("makes the actions the column that gives way", () => {
    const actionsWrapper = headerWithActions().get("button").element.parentElement!;
    expect(actionsWrapper.className).toContain("flex-wrap");
    expect(actionsWrapper.className).not.toContain("lg:shrink-0");
    // `lg:flex-1` here would set a zero flex basis, which always fits — the
    // line would never break and the title would be back to taking leftovers.
    expect(actionsWrapper.className).not.toContain("lg:flex-1");
  });
});
