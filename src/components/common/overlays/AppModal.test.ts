import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import AppModal from "./AppModal.vue";
import { clearModalOrigin } from "@/lib/modalOrigin";
import { _resetModalStack } from "./modalStack";

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
  _resetModalStack();
  document.body.innerHTML = "";
});

function container() {
  return document.body.querySelector<HTMLElement>("[data-modal-backdrop]")!.parentElement!;
}

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

  // The registry resolves a same-layer collision by registration order, and
  // both shells here are mounted before either opens — a picker sitting beside
  // its host dialog is the everyday case. Opening must be what registers, or
  // Escape on the stack would close the host underneath the picker.
  it("routes Escape to the most recently opened modal, not the most recently mounted", async () => {
    const opts = {
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    };
    const mountedFirst = mount(AppModal, { props: { open: false }, ...opts });
    const mountedSecond = mount(AppModal, { props: { open: false }, ...opts });

    await mountedSecond.setProps({ open: true });
    await mountedFirst.setProps({ open: true }); // opened last → on top

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();

    expect(mountedFirst.emitted("close")).toHaveLength(1);
    expect(mountedSecond.emitted("close")).toBeUndefined();
    mountedFirst.unmount();
    mountedSecond.unmount();
  });

  // Escape on a modal stack means "dismiss the top thing". When the top thing
  // refuses, the answer is nothing — not the dialog beneath it closing unseen.
  it("swallows Escape on a non-dismissable modal instead of passing it beneath", async () => {
    const opts = {
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    };
    const below = mount(AppModal, { props: { open: false }, ...opts });
    const top = mount(AppModal, { props: { open: false, dismissable: false }, ...opts });

    await below.setProps({ open: true });
    await top.setProps({ open: true });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();

    expect(top.emitted("close")).toBeUndefined();
    expect(below.emitted("close")).toBeUndefined();
    below.unmount();
    top.unmount();
  });

  // A confirm wants an answer. A stray click beside the panel is not one —
  // but Escape still is, so the two dismissal routes part company here.
  it("can refuse a backdrop click while still closing on Escape", async () => {
    const wrapper = open({ backdropDismiss: false });
    const container = document.body.querySelector<HTMLElement>("[data-modal-backdrop]")!.parentElement!;

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted("close")).toBeUndefined();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  /**
   * A picker opened from inside a dialog is usually declared *before* it in the
   * same template, and a Teleport's anchor is placed at component mount — so a
   * flat z-index would paint the picker behind the thing that opened it. Levels
   * are claimed on open instead, which also makes stacking agree with the
   * hotkey layer's "most recently opened wins".
   */
  it("paints the modal opened last on top, whatever order they were declared in", async () => {
    const opts = {
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    };
    const declaredFirst = mount(AppModal, { props: { open: false }, ...opts });
    const declaredSecond = mount(AppModal, { props: { open: false }, ...opts });

    // Open them against declaration order: the second one first.
    await declaredSecond.setProps({ open: true });
    await declaredFirst.setProps({ open: true });

    const [a, b] = document.body.querySelectorAll<HTMLElement>("[data-modal-backdrop]");
    const zOf = (el: HTMLElement) => Number(el.parentElement!.style.zIndex);
    // `a` is the first-declared container, which was opened last → higher.
    expect(zOf(a)).toBeGreaterThan(zOf(b));
    declaredFirst.unmount();
    declaredSecond.unmount();
  });

  it("gives its level back on close, so levels do not creep upward", async () => {
    const opts = {
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    };
    const first = mount(AppModal, { props: { open: true }, ...opts });
    const firstZ = Number(container().style.zIndex);
    await first.setProps({ open: false });
    first.unmount();

    const second = mount(AppModal, { props: { open: true }, ...opts });
    expect(Number(container().style.zIndex)).toBe(firstZ);
    second.unmount();
  });

  it("sits under the reader's eye when aligned to the top, for a palette", () => {
    const wrapper = open({ align: "top" });

    expect(container().className).toContain("items-start");
    expect(container().className).not.toContain("items-center");
    wrapper.unmount();
  });

  /**
   * The player portal is held in one hand at the table, and its dialogs rose
   * from the bottom edge before they moved onto the shell. Losing that on the
   * way in would have been a downgrade on the surface that needs it most.
   */
  it("rises from the bottom edge on a phone and centres from sm up, as a sheet", () => {
    const wrapper = open({ align: "sheet" });

    const c = container().className;
    expect(c).toContain("items-end");
    expect(c).toContain("sm:items-center");
    // Edge to edge on a phone: a sheet with a gutter around it is just a card.
    expect(c).toContain("p-0");
    expect(c).toContain("sm:p-4");
    wrapper.unmount();
  });

  // `rounded-xl` used to sit in the static class attribute, where tailwind-merge
  // could not see it — the same trap `max-h-full` fell into, and what made the
  // sheet's square bottom edge impossible to express.
  it("lets the sheet square off its bottom corners", () => {
    const wrapper = open({ align: "sheet" });

    const classes = panel()!.className;
    expect(classes).toContain("rounded-t-2xl");
    expect(classes).not.toContain("rounded-xl ");
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

  describe("keeping Tab inside the panel", () => {
    const tab = (target: Element, shiftKey = false) => {
      const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };

    it("Shift+Tab from the panel itself, where focus lands on open, goes to the last control", () => {
      const wrapper = open({}, "<button>First</button><button>Last</button>");
      const buttons = [...panel()!.querySelectorAll("button")];
      panel()!.focus();

      const event = tab(panel()!, true);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(buttons[1]);
      wrapper.unmount();
    });

    it("Shift+Tab from the last control moves back normally instead of wrapping", () => {
      const wrapper = open({}, "<button>First</button><button>Last</button>");
      const buttons = [...panel()!.querySelectorAll("button")];
      buttons[1].focus();

      expect(tab(buttons[1], true).defaultPrevented).toBe(false);
      wrapper.unmount();
    });

    it("Tab from the first control moves on normally instead of wrapping", () => {
      const wrapper = open({}, "<button>First</button><button>Last</button>");
      const buttons = [...panel()!.querySelectorAll("button")];
      buttons[0].focus();

      expect(tab(buttons[0]).defaultPrevented).toBe(false);
      wrapper.unmount();
    });

    it("a disabled button is not a stop, so the last enabled control is where Tab wraps", () => {
      const wrapper = open({}, "<button>Only</button><button disabled>Off</button>");
      const only = panel()!.querySelector("button")!;
      only.focus();

      const event = tab(only);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(only);
      wrapper.unmount();
    });

    it("a panel with nothing to focus keeps Tab from leaving it", () => {
      const wrapper = open({}, "<p>Just words</p>");
      panel()!.focus();

      expect(tab(panel()!).defaultPrevented).toBe(true);
      wrapper.unmount();
    });
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

describe("AppModal beside the right-hand dock", () => {
  afterEach(() => document.documentElement.style.removeProperty("--dock-right"));

  // Bug caught: the backdrop covering the dock, so a card opened from inside a sheet was dimmed and unclickable.
  it("stops its backdrop at the dock's edge, and a click in the dock does not close it", async () => {
    document.documentElement.style.setProperty("--dock-right", "26rem");
    const closed: string[] = [];
    mount(AppModal, {
      props: { open: true, onClose: () => closed.push("close") },
      slots: { default: "<button>Inside</button>" },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    });
    await flushPromises();
    const container = panel()?.parentElement;
    expect(container?.style.right).toBe("var(--dock-right, 0px)");
    // A click in the dock is not on the modal's element at all; a click on its backdrop still closes it.
    const dock = document.createElement("aside");
    document.body.appendChild(dock);
    dock.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(closed).toEqual([]);
    container?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(closed).toEqual(["close"]);
  });

  function withDock() {
    const dock = document.createElement("aside");
    dock.setAttribute("data-side-dock", "");
    dock.innerHTML = "<button>D1</button><button>D2</button>";
    document.body.appendChild(dock);
    return [...dock.querySelectorAll("button")];
  }
  const tab = (target: Element, shiftKey = false) => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));

  // Bug caught: Tab wrapping inside the sheet, so a keyboard user who opened a card in the dock could never reach it.
  it("Tab past the sheet's last control goes to the dock's first, and Shift+Tab before its first to the dock's last", () => {
    const [d1, d2] = withDock();
    open({}, "<button>First</button><button>Last</button>");
    const [first, last] = [...panel()!.querySelectorAll("button")];
    last.focus();
    tab(last);
    expect(document.activeElement).toBe(d1);
    first.focus();
    tab(first, true);
    expect(document.activeElement).toBe(d2);
  });

  // Bug caught: the dock a dead end, with Tab from its last control leaving the page (or the modal) unreachable.
  it("Tab from the dock's last control returns to the sheet's first, and Shift+Tab from its first to the sheet's last", () => {
    const [d1, d2] = withDock();
    open({}, "<button>First</button><button>Last</button>");
    const [first, last] = [...panel()!.querySelectorAll("button")];
    d2.focus();
    tab(d2);
    expect(document.activeElement).toBe(first);
    d1.focus();
    tab(d1, true);
    expect(document.activeElement).toBe(last);
  });

  // Bug caught: every open modal listens for the dock's Tab, so with two stacked the bottom one took it and focus
  // landed in a panel hidden under the top modal.
  it("with two modals stacked, Tab from the dock returns to the top modal only", () => {
    const [, d2] = withDock();
    open({}, "<button>Under</button>");
    open({}, "<button>Over</button>");
    const [under, over] = [...document.body.querySelectorAll<HTMLElement>("[data-modal-panel]")].map((p) => p.querySelector("button")!);
    d2.focus();
    tab(d2);
    expect(document.activeElement).toBe(over);
    expect(document.activeElement).not.toBe(under);
  });

  // Bug caught: Escape pressed in the Familiar closing the sheet it was opened from.
  it("Escape inside the dock does not close the sheet, and still does from the sheet", () => {
    const [d1] = withDock();
    const closed: string[] = [];
    mount(AppModal, { props: { open: true, onClose: () => closed.push("x") }, slots: { default: "<button>In</button>" }, attachTo: document.body, global: { stubs: { transition: false } } });
    d1.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(closed).toEqual([]);
    panel()!.querySelector("button")!.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(closed).toEqual(["x"]);
  });
});
