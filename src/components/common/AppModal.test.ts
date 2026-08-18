import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import AppModal from "./AppModal.vue";
import { clearModalOrigin } from "@/lib/modalOrigin";

/**
 * happy-dom has no Web Animations, so `canAnimate` is false throughout and every
 * transition resolves synchronously. That is the same path a reader with
 * `prefers-reduced-motion` takes, so these cover both.
 */
function open(props: Record<string, unknown> = {}, slot = "<button>Inside</button>") {
  return mount(AppModal, {
    props: { open: true, ...props },
    slots: { default: slot },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
}

function panel() {
  return document.body.querySelector<HTMLElement>("[data-modal-panel]");
}

afterEach(() => {
  clearModalOrigin();
  document.body.innerHTML = "";
});

describe("AppModal", () => {
  it("teleports a labelled dialog to the body", () => {
    const wrapper = open({ label: "NPC" });

    const el = panel();
    expect(el).not.toBeNull();
    expect(el!.getAttribute("role")).toBe("dialog");
    expect(el!.getAttribute("aria-modal")).toBe("true");
    expect(el!.getAttribute("aria-label")).toBe("NPC");
    wrapper.unmount();
  });

  it("prefers an explicit heading over the fallback label for its name", () => {
    const wrapper = open({ label: "NPC", labelledBy: "heading-1" });

    expect(panel()!.getAttribute("aria-labelledby")).toBe("heading-1");
    // Both at once would have a screen reader read the name twice.
    expect(panel()!.getAttribute("aria-label")).toBeNull();
    wrapper.unmount();
  });

  // The backdrop must not swallow the event, or `.self` on the container never
  // matches and dismiss-on-backdrop silently does nothing — which is the state
  // the hand-rolled dialogs this replaces were copied into.
  it("closes when the click misses the panel", async () => {
    const wrapper = open();
    const container = document.body.querySelector<HTMLElement>("[data-modal-backdrop]")!.parentElement!;

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("stays open when the click lands on the panel", async () => {
    const wrapper = open();

    panel()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("closes on Escape", async () => {
    const wrapper = open();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("ignores Escape and backdrop clicks when it is not dismissable", async () => {
    const wrapper = open({ dismissable: false });
    const container = document.body.querySelector<HTMLElement>("[data-modal-backdrop]")!.parentElement!;

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("leaves Escape alone once closed, so the page keeps its own shortcuts", async () => {
    const wrapper = mount(AppModal, {
      props: { open: false },
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("moves focus into the panel on open and hands it back on close", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    const wrapper = mount(AppModal, {
      props: { open: false },
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(document.activeElement).toBe(panel());

    await wrapper.setProps({ open: false });
    await flushPromises();
    // Focus left on a detached node drops to <body>, losing the user's place.
    expect(document.activeElement).toBe(outside);
    wrapper.unmount();
  });

  // The panel is teleported to `body`, so nothing contains Tab on its own:
  // without this, tabbing past the last control walks into the page behind the
  // backdrop, where every stop is invisible and unclickable.
  it("wraps Tab from the last control back to the first", async () => {
    const wrapper = open({}, "<button>First</button><button>Last</button>");
    const [first, last] = [...panel()!.querySelectorAll("button")];
    last.focus();

    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await nextTick();

    expect(document.activeElement).toBe(first);
    wrapper.unmount();
  });

  it("wraps Shift+Tab from the first control to the last", async () => {
    const wrapper = open({}, "<button>First</button><button>Last</button>");
    const buttons = [...panel()!.querySelectorAll("button")];
    buttons[0].focus();

    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    await nextTick();

    expect(document.activeElement).toBe(buttons[1]);
    wrapper.unmount();
  });

  it("announces when the panel has finished leaving, so a route change can wait for it", async () => {
    const wrapper = mount(AppModal, {
      props: { open: true },
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    });

    await wrapper.setProps({ open: false });
    await flushPromises();

    expect(wrapper.emitted("afterLeave")).toHaveLength(1);
    wrapper.unmount();
  });

  // `max-h-full` is the shell's own default. Left in the static class attribute
  // it sat outside `cn()`, where tailwind-merge could not dedupe it — so it beat
  // every caller that passed a height and the caller's class was inert.
  it("lets a caller's height override the shell's default", () => {
    const wrapper = open({ panelClass: "max-h-[30rem]" });

    const classes = panel()!.className;
    expect(classes).toContain("max-h-[30rem]");
    expect(classes).not.toContain("max-h-full");
    wrapper.unmount();
  });

  it("keeps the default when the caller asks for no height", () => {
    const wrapper = open();

    expect(panel()!.className).toContain("max-h-full");
    wrapper.unmount();
  });
});
