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
});
