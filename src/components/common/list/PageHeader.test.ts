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

  // Bug (24 Nov 2026): the root was `overflow-x-hidden`, which makes the y axis `auto` too, so the whole column, title
  // and all, was a scroller a focus or a jump could slide (the Canon page's header left the screen). The box around the
  // body and the sidebar was `lg:overflow-hidden`, scrollable the same way. Clipped boxes cannot be scrolled at all.
  it("leaves only the body and the sidebar able to scroll", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Canon" },
      slots: { default: "Parts", sidebar: "Entry" },
    });

    // The template opens with a comment, so the component is a fragment: the first element is the root.
    const root = wrapper.get("div").element;
    expect(root.classList).toContain("overflow-x-clip");
    expect(root.classList).not.toContain("overflow-x-hidden");
    const frame = wrapper.get('[data-testid="page-body"]').element.parentElement!;
    expect(frame.classList).toContain("lg:overflow-clip");
    expect(frame.classList).not.toContain("lg:overflow-hidden");
  });
});
