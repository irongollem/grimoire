import { describe, it, expect } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import PageHeaderAction from "./PageHeaderAction.vue";
import ListActionButton from "./ListActionButton.vue";

const global = { stubs: { RouterLink: RouterLinkStub } };

/**
 * These two own nothing but a prop bundle over AppButton — all chrome still comes
 * from the variant matrix. What they DO own is a set of defaults, and those
 * defaults are load-bearing: the collapse breakpoint differs between them, and the
 * collapse default silently flipped a Save button's label during the migration
 * before this file existed.
 */
describe("PageHeaderAction", () => {
  it("renders a real button carrying AppButton's md chrome", () => {
    const w = mount(PageHeaderAction, { props: { label: "Edit" }, global });
    expect(w.element.tagName).toBe("BUTTON");
    const cls = w.attributes("class") ?? "";
    expect(cls).toContain("text-label-lg");
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("py-2");
  });

  it("defaults to the subtle variant", () => {
    const w = mount(PageHeaderAction, { props: { label: "Edit" }, global });
    expect(w.attributes("class")).toContain("text-muted-foreground");
  });

  it("collapses the label at lg, not sm", () => {
    const w = mount(PageHeaderAction, { props: { label: "Delete" }, global });
    expect(w.find("span.max-lg\\:hidden").text()).toBe("Delete");
    expect(w.find("span.max-sm\\:hidden").exists()).toBe(false);
  });

  // The Save/Create action must keep its label at every width — it also carries
  // the "Saving…" state, which is invisible as a bare icon.
  it("keeps the label at every width when collapse is turned off", () => {
    const w = mount(PageHeaderAction, {
      props: { label: "Save", collapseLabelOnMobile: false },
      global,
    });
    expect(w.find("span.max-lg\\:hidden").exists()).toBe(false);
    expect(w.text()).toBe("Save");
  });

  it("passes variant, icon props and listeners straight through", async () => {
    const w = mount(PageHeaderAction, {
      props: { label: "Delete", variant: "destructive" },
      attrs: { "data-testid": "del" },
      global,
    });
    expect(w.attributes("class")).toContain("text-destructive");
    expect(w.attributes("data-testid")).toBe("del");
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);
  });
});

describe("ListActionButton", () => {
  it("defaults to the outline variant", () => {
    const w = mount(ListActionButton, { props: { label: "Generate" }, global });
    expect(w.attributes("class")).toContain("text-foreground");
  });

  it("collapses the label at sm — a list action row has more room than a header", () => {
    const w = mount(ListActionButton, { props: { label: "Generate" }, global });
    expect(w.find("span.max-sm\\:hidden").text()).toBe("Generate");
    expect(w.find("span.max-lg\\:hidden").exists()).toBe(false);
  });

  it("still renders a RouterLink when given `to`", () => {
    const w = mount(ListActionButton, { props: { label: "New", to: "/monsters/new" }, global });
    expect(w.findComponent(RouterLinkStub).props("to")).toBe("/monsters/new");
  });

  it("honours a short mobile label", () => {
    const w = mount(ListActionButton, {
      props: { label: "New Monster", mobileLabel: "+Monster" },
      global,
    });
    expect(w.find("span.max-sm\\:hidden").text()).toBe("New Monster");
    expect(w.find("span.sm\\:hidden").text()).toBe("+Monster");
  });
});
