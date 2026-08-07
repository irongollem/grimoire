import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import { RouterLinkStub } from "@vue/test-utils";
import AppButton from "./AppButton.vue";
import { buttonVariants } from "./appButtonVariants";

const global = { stubs: { RouterLink: RouterLinkStub } };

describe("buttonVariants", () => {
  it("defaults to the most common control in the app (subtle / sm)", () => {
    const cls = buttonVariants({});
    expect(cls).toContain("border-border");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("text-label-lg");
    expect(cls).toContain("px-3");
  });

  it("maps each size onto its typography role", () => {
    expect(buttonVariants({ size: "xs" })).toContain("text-label");
    expect(buttonVariants({ size: "sm" })).toContain("text-label-lg");
    expect(buttonVariants({ size: "lg" })).toContain("text-sm");
  });

  // Bare text actions sit inline in a row; giving them a box would shift the
  // layout around them.
  it("gives the inline sizes no padding or radius", () => {
    for (const size of ["inline", "inline-xs"] as const) {
      const cls = buttonVariants({ size });
      expect(cls).not.toMatch(/\bp[xy]?-/);
      expect(cls).not.toContain("rounded");
    }
  });

  it("keeps the ≥44px touch target on md and drops it from md up", () => {
    const cls = buttonVariants({ size: "md" });
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("md:min-h-0");
  });

  it("applies one selected treatment for toggles", () => {
    expect(buttonVariants({ active: true })).toContain("bg-primary/10");
    expect(buttonVariants({ active: false })).not.toContain("bg-primary/10");
  });
});

describe("AppButton", () => {
  it("renders a native button by default and carries the label", () => {
    const w = mount(AppButton, { props: { label: "Save" }, global });
    expect(w.element.tagName).toBe("BUTTON");
    expect(w.attributes("type")).toBe("button");
    expect(w.text()).toBe("Save");
  });

  it("renders a RouterLink when `to` is set", () => {
    const w = mount(AppButton, { props: { label: "Open", to: "/spells" }, global });
    expect(w.element.tagName).not.toBe("BUTTON");
    expect(w.findComponent(RouterLinkStub).props("to")).toBe("/spells");
    expect(w.attributes("type")).toBeUndefined();
  });

  it("renders an anchor when `href` is set", () => {
    const w = mount(AppButton, { props: { label: "Docs", href: "https://example.test" }, global });
    expect(w.element.tagName).toBe("A");
    expect(w.attributes("href")).toBe("https://example.test");
  });

  // The whole point of routing `class` through cn(): a call site overriding the
  // size must actually replace the variant's, not sit alongside it.
  it("lets a call-site class beat the variant default", () => {
    const w = mount(AppButton, { props: { label: "Go", size: "sm", class: "text-sm" }, global });
    const cls = w.attributes("class") ?? "";
    expect(cls).toContain("text-sm");
    expect(cls).not.toContain("text-label-lg");
  });

  it("does not emit a duplicate class attribute", () => {
    const w = mount(AppButton, { props: { label: "Go", class: "w-32" }, global });
    expect(w.html().match(/class=/g)).toHaveLength(1);
  });

  it("forwards unrelated attributes", () => {
    const w = mount(AppButton, {
      props: { label: "Go" },
      attrs: { "data-testid": "go", "aria-pressed": "true" },
      global,
    });
    expect(w.attributes("data-testid")).toBe("go");
    expect(w.attributes("aria-pressed")).toBe("true");
  });

  it("emits click when enabled and swallows it when disabled", async () => {
    const w = mount(AppButton, { props: { label: "Go" }, global });
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);

    const d = mount(AppButton, { props: { label: "Go", disabled: true }, global });
    await d.trigger("click");
    expect(d.emitted("click")).toBeUndefined();
    expect(d.attributes("disabled")).toBeDefined();
  });

  // A RouterLink ignores `disabled`, so links need the aria + guard instead.
  it("marks a disabled link aria-disabled and blocks its click", async () => {
    const w = mount(AppButton, { props: { label: "Go", href: "#x", disabled: true }, global });
    expect(w.attributes("aria-disabled")).toBe("true");
    await w.trigger("click");
    expect(w.emitted("click")).toBeUndefined();
  });

  it("shows a spinner instead of the icon while loading, and blocks clicks", async () => {
    const Icon = { render: () => h("svg", { "data-icon": "true" }) };
    const w = mount(AppButton, { props: { label: "Saving", icon: Icon, loading: true }, global });
    expect(w.find("[data-icon]").exists()).toBe(false);
    expect(w.find(".animate-spin").exists()).toBe(true);
    await w.trigger("click");
    expect(w.emitted("click")).toBeUndefined();
  });

  it("collapses the label below sm, or swaps in the mobile one", () => {
    const collapsed = mount(AppButton, {
      props: { label: "New Monster", collapseLabelOnMobile: true },
      global,
    });
    expect(collapsed.find("span.max-sm\\:hidden").text()).toBe("New Monster");

    const swapped = mount(AppButton, {
      props: { label: "New Monster", mobileLabel: "+Monster" },
      global,
    });
    expect(swapped.find("span.max-sm\\:hidden").text()).toBe("New Monster");
    expect(swapped.find("span.sm\\:hidden").text()).toBe("+Monster");
  });

  // List rows collapse at sm; detail-page header actions sit in a tighter row and
  // collapsed at lg before PageHeaderAction was folded in.
  it("honours the collapse breakpoint", () => {
    const w = mount(AppButton, {
      props: { label: "Delete", collapseLabelOnMobile: true, collapseBelow: "lg" },
      global,
    });
    expect(w.find("span.max-lg\\:hidden").text()).toBe("Delete");
    expect(w.find("span.max-sm\\:hidden").exists()).toBe(false);
  });

  it("prefers the default slot over the label prop", () => {
    const w = mount(AppButton, {
      props: { label: "ignored" },
      slots: { default: "<em>custom</em>" },
      global,
    });
    expect(w.html()).toContain("<em>custom</em>");
    expect(w.text()).not.toContain("ignored");
  });

  it("uses the tooltip for aria-label when the visible label names state", () => {
    const w = mount(AppButton, {
      props: { label: "Kanban", tooltip: "Switch to list view" },
      global,
    });
    expect(w.attributes("aria-label")).toBe("Switch to list view");
  });
});
