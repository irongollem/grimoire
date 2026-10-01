import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardWidget from "./DashboardWidget.vue";

const mocks = vi.hoisted(() => ({ overlays: { value: true } }));

vi.mock(import("@/composables/useBreakpoint"), async (importOriginal) => ({
  ...(await importOriginal()),
  // A real ref: the component reads `.value` reactively, and each test decides
  // which side of `lg` it is on before mounting.
  useAbove: () => mocks.overlays as ReturnType<typeof import("@/composables/useBreakpoint").useAbove>,
}));

/**
 * The test DOM lays nothing out, so every height here is stated rather than
 * measured. `content` is how tall the body's contents are; `room` is how much
 * of that the rolled-up card has space for before its footer takes a share.
 */
const layout = { content: 0, room: 0 };
const FOOTER_HEIGHT = 28;
const HEADER_HEIGHT = 41;

function isBody(el: HTMLElement): boolean {
  return el.hasAttribute("data-test-body") || el.querySelector(":scope > [data-test-content]") !== null;
}

function footerOf(el: HTMLElement): Element | null {
  return el.closest("section")?.querySelector("button[aria-controls]") ?? null;
}

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  mocks.overlays = ref(true);
  layout.content = 0;
  layout.room = 0;
  // The test DOM ships a `ResizeObserver` that never reports. Without one the
  // card measures from its own lifecycle hooks, which is the path these tests
  // drive; the observer path has its own test at the bottom.
  vi.stubGlobal("ResizeObserver", undefined);

  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return isBody(this) ? layout.content : 0;
  });
  // A real footer is carved out of the body, so the body gets shorter the
  // moment one renders. A stub that ignored that would report a card flipping
  // between "fits" and "does not" forever, which the real layout never does.
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!isBody(this)) return 0;
    return layout.room - (footerOf(this) === null ? 0 : FOOTER_HEIGHT);
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName === "SECTION") {
      // Unrolled, the card is as tall as everything in it; rolled up, its slot.
      const unrolled = this.parentElement?.hasAttribute("data-unrolled") === true;
      const natural = HEADER_HEIGHT + layout.content + FOOTER_HEIGHT;
      return unrolled ? Math.max(natural, HEADER_HEIGHT + layout.room) : HEADER_HEIGHT + layout.room;
    }
    if (this.querySelector(":scope > section") !== null) return HEADER_HEIGHT + layout.room;
    return this.querySelector(":scope > button[aria-controls]") !== null ? FOOTER_HEIGHT : 0;
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountWidget(attrs: Record<string, unknown> = {}) {
  wrapper = mount(DashboardWidget, {
    attachTo: document.body,
    props: { title: "Conditions" },
    attrs,
    slots: {
      default:
        '<div data-test-content><button data-test-row type="button">Blinded</button><input data-test-input /></div>',
    },
    global: { stubs: { RouterLink: true } },
  });
  return wrapper;
}

/** Whatever changed the stated heights, make the card look again. */
async function remeasure(w: VueWrapper, count: number) {
  await w.setProps({ count });
  await nextTick();
  await nextTick();
}

/**
 * A click on the page outside the card, as a separate gesture. VueUse's
 * `onClickOutside` ignores a second click inside the same task as the first
 * (it is de-duplicating one physical click seen twice), so the click that
 * opened the card has to be allowed to finish before another one counts.
 */
async function clickElsewhere() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.click();
  await nextTick();
}

const toggle = (w: VueWrapper) => w.find("button[aria-controls]");
const isUnrolled = (w: VueWrapper) => w.element.hasAttribute("data-unrolled");

describe("DashboardWidget", () => {
  it("has no footer when everything fits", async () => {
    layout.content = 200;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    expect(toggle(w).exists()).toBe(false);
  });

  it("never makes its body a scroll container", async () => {
    // The whole point: the page is the only thing that scrolls. `clip`, not
    // `hidden`, because a hidden box can still be scrolled by focus.
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    const html = w.html();
    expect(html).toContain("overflow-y-clip");
    expect(html).not.toMatch(/overflow-y-auto|overflow-auto|overflow-y-scroll|overscroll-contain/);
  });

  it("offers to show more when the body is cut, and unrolls on request", async () => {
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();

    expect(toggle(w).text()).toBe("Show more");
    expect(toggle(w).attributes("aria-expanded")).toBe("false");
    expect(isUnrolled(w)).toBe(false);

    await toggle(w).trigger("click");
    await nextTick();

    expect(toggle(w).text()).toBe("Show less");
    expect(toggle(w).attributes("aria-expanded")).toBe("true");
    expect(isUnrolled(w)).toBe(true);
    // Unrolled, nothing is cut any more.
    expect(w.html()).not.toContain("overflow-y-clip");

    await toggle(w).trigger("click");
    await nextTick();
    expect(isUnrolled(w)).toBe(false);
    expect(toggle(w).text()).toBe("Show more");
  });

  it("does not keep a footer that only exists because the footer took the room", async () => {
    // 250 of content in 260 of room fits. It would stop fitting the moment a
    // 28-high footer arrived, and a naive check would then keep that footer
    // forever, offering to reveal nothing.
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    expect(toggle(w).exists()).toBe(true);

    layout.content = 250;
    await remeasure(w, 1);
    expect(toggle(w).exists()).toBe(false);
  });

  it("rolls up on Escape and hands focus back to the footer", async () => {
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();

    const row = w.find("[data-test-row]");
    (row.element as HTMLElement).focus();
    await row.trigger("keydown", { key: "Escape" });
    await nextTick();

    expect(isUnrolled(w)).toBe(false);
    expect(document.activeElement).toBe(toggle(w).element);
  });

  it("leaves Escape to a text field inside it", async () => {
    // The field's own Escape (close a dropdown, clear a search) has already
    // run by the time the key bubbles here. Taking it too shut the dropdown
    // *and* the card on one press.
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();

    await w.find("[data-test-input]").trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(isUnrolled(w)).toBe(true);
  });

  it("rolls up on a click elsewhere while it lies over the board", async () => {
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();

    await clickElsewhere();
    expect(isUnrolled(w)).toBe(false);
  });

  it("stays open on a tap elsewhere below lg, where it covers nothing", async () => {
    mocks.overlays = ref(false);
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();

    await clickElsewhere();
    expect(isUnrolled(w)).toBe(true);
  });

  it("stays open on a click inside the card", async () => {
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();

    (w.find("[data-test-row]").element as HTMLElement).click();
    await nextTick();
    expect(isUnrolled(w)).toBe(true);
  });

  it("unrolls by itself when it grows because it was used", async () => {
    // A dice result, a condition's rules, search results: the DM pressed
    // something and the answer landed below the cut.
    layout.content = 200;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    expect(toggle(w).exists()).toBe(false);

    await w.find("[data-test-row]").trigger("click");
    layout.content = 420;
    await remeasure(w, 1);

    expect(isUnrolled(w)).toBe(true);
  });

  it("does not unroll for growth nobody caused", async () => {
    // A query landing or a row synced in from another client. The footer
    // appears; the board does not rearrange itself under the DM.
    layout.content = 200;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();

    layout.content = 420;
    await remeasure(w, 1);

    expect(isUnrolled(w)).toBe(false);
    expect(toggle(w).text()).toBe("Show more");
  });

  it("rolls up by itself once there is nothing left to show", async () => {
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();
    expect(isUnrolled(w)).toBe(true);

    // The search was cleared: everything fits the slot again, footer included.
    layout.content = 120;
    await remeasure(w, 1);

    expect(isUnrolled(w)).toBe(false);
    expect(toggle(w).exists()).toBe(false);
  });

  it("rolls up a card that is only too tall because of its own footer", async () => {
    // 250 of content in 260 of room has no footer rolled up. Unrolled, the
    // "Show less" strip makes the card taller than its slot, and counting that
    // strip left the card open over a dimmed board with nothing to show.
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();

    layout.content = 250;
    await remeasure(w, 1);

    expect(isUnrolled(w)).toBe(false);
    expect(toggle(w).exists()).toBe(false);
  });

  it("rolls up when its body goes away", async () => {
    layout.content = 600;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    await toggle(w).trigger("click");
    await nextTick();

    await w.setProps({ loading: true });
    await nextTick();
    expect(isUnrolled(w)).toBe(false);
    expect(toggle(w).exists()).toBe(false);
  });

  it("puts the layout's classes on the grid item, not on the card inside it", () => {
    // The view hands each widget its column and row span as a class. Those
    // must land on the box that holds its place in the grid, or an unrolled
    // card would take its span with it when it lifts out of the flow.
    const w = mountWidget({ class: "lg:col-span-2 lg:row-span-3" });
    expect(w.classes()).toContain("lg:col-span-2");
    expect(w.find("section").classes()).not.toContain("lg:col-span-2");
  });

  it("watches the body once, not again on every re-render", async () => {
    // `onUpdated` runs for every keystroke in a search and every row synced
    // in, on every card. Rebuilding the observed set each time was a forced
    // layout and a burst of callbacks per card per keystroke.
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect = disconnect;
      },
    );
    layout.content = 200;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();
    // The body, and the one element in it.
    expect(observe).toHaveBeenCalledTimes(2);

    await w.setProps({ count: 1 });
    await w.setProps({ count: 2 });
    await nextTick();

    expect(observe).toHaveBeenCalledTimes(2);
    expect(unobserve).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("stops watching a body that has gone", async () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect = vi.fn();
      },
    );
    layout.content = 200;
    layout.room = 260;
    const w = mountWidget();
    await nextTick();

    await w.setProps({ loading: true });
    await nextTick();
    expect(unobserve).toHaveBeenCalledTimes(2);
  });
});
