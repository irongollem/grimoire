import { beforeEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

// Phone width: the header is the sticky one that slides away.
const below = vi.hoisted(() => ({ lg: undefined as undefined | { value: boolean } }));
vi.mock("@/composables/useBreakpoint", async () => {
  const { ref } = await import("vue");
  below.lg = ref(true);
  return { useBelow: () => below.lg };
});

import ListPageLayout from "./ListPageLayout.vue";

function mountInScroller() {
  const scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  document.body.appendChild(scroller);
  const host = document.createElement("div");
  scroller.appendChild(host);
  const wrapper = mount(ListPageLayout, {
    props: { title: "Atlas" },
    slots: { filters: '<input aria-label="Search" />', default: "<p>list</p>" },
    attachTo: host,
  });
  const header = wrapper.element.querySelector(".sticky") as HTMLElement;
  // happy-dom has no layout; give the header a height to scroll past.
  Object.defineProperty(header, "offsetHeight", { value: 100 });
  const scrollTo = async (y: number) => {
    scroller.scrollTop = y;
    scroller.dispatchEvent(new Event("scroll"));
    await wrapper.vm.$nextTick();
  };
  return { wrapper, header, scrollTo };
}

describe("ListPageLayout header on a phone", () => {
  beforeEach(() => {
    if (below.lg) below.lg.value = true;
  });

  it("slides away scrolling down and comes back scrolling up", async () => {
    const { header, scrollTo } = mountInScroller();
    await scrollTo(400);
    expect(header.classList.contains("-translate-y-full")).toBe(true);
    await scrollTo(360);
    expect(header.classList.contains("-translate-y-full")).toBe(false);
  });

  it("ignores jitter smaller than the threshold", async () => {
    const { header, scrollTo } = mountInScroller();
    await scrollTo(400);
    await scrollTo(396);
    expect(header.classList.contains("-translate-y-full")).toBe(true);
  });

  it("a scroll of exactly the threshold counts, one pixel less does not", async () => {
    const { header, scrollTo } = mountInScroller();
    await scrollTo(400);
    await scrollTo(360);
    expect(header.classList.contains("-translate-y-full")).toBe(false);
    await scrollTo(367);
    expect(header.classList.contains("-translate-y-full")).toBe(false);
    await scrollTo(368);
    expect(header.classList.contains("-translate-y-full")).toBe(true);
  });

  it("never hides on a screen wide enough to keep the header in place", async () => {
    below.lg!.value = false;
    const { header, scrollTo } = mountInScroller();
    await scrollTo(400);
    expect(header.classList.contains("-translate-y-full")).toBe(false);
  });

  it("comes back when the window is widened while it is hidden", async () => {
    const { header, scrollTo, wrapper } = mountInScroller();
    await scrollTo(400);
    expect(header.classList.contains("-translate-y-full")).toBe(true);
    below.lg!.value = false;
    await wrapper.vm.$nextTick();
    expect(header.classList.contains("-translate-y-full")).toBe(false);
  });

  it("comes back as soon as something inside it takes focus", async () => {
    const { wrapper, header, scrollTo } = mountInScroller();
    await scrollTo(400);
    expect(header.classList.contains("-translate-y-full")).toBe(true);
    wrapper.element.querySelector("input")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(header.classList.contains("-translate-y-full")).toBe(false);
  });

  it("stops listening to the scroller when the page goes away", () => {
    const { wrapper } = mountInScroller();
    const scroller = wrapper.element.parentElement!.parentElement!;
    const remove = vi.spyOn(scroller, "removeEventListener");
    wrapper.unmount();
    expect(remove.mock.calls.some(([type]) => type === "scroll")).toBe(true);
  });

  it("always shows near the top, where it sits in its natural place", async () => {
    const { header, scrollTo } = mountInScroller();
    await scrollTo(400);
    await scrollTo(60);
    expect(header.classList.contains("-translate-y-full")).toBe(false);
  });

  it("stays while the search inside it has focus", async () => {
    const { wrapper, header, scrollTo } = mountInScroller();
    (wrapper.element.querySelector("input") as HTMLInputElement).focus();
    await scrollTo(400);
    expect(header.classList.contains("-translate-y-full")).toBe(false);
  });
});

describe("ListPageLayout divider", () => {
  it("is hidden on a phone when there are no actions above it", () => {
    const wrapper = mount(ListPageLayout, { props: { title: "Scriptorium" }, slots: { default: "<p>list</p>" } });
    expect(wrapper.find(".gold-divider").classes()).toContain("hidden");
    expect(wrapper.find(".gold-divider").classes()).toContain("md:block");
  });

  it("shows under the actions when there are some", () => {
    const wrapper = mount(ListPageLayout, {
      props: { title: "Scriptorium" },
      slots: { actions: "<button>New</button>", default: "<p>list</p>" },
    });
    expect(wrapper.find(".gold-divider").classes()).not.toContain("hidden");
  });
});
