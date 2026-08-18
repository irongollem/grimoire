import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import EntityDetailModal from "./EntityDetailModal.vue";

function open(props: Record<string, unknown> = {}) {
  return mount(EntityDetailModal, {
    props: { title: "Ambrose Thistlefizz", subtitle: "Gnome · Chief Scientist", ...props },
    slots: { default: "<p>Sheet body</p>" },
    attachTo: document.body,
    global: {
      // Transitions are stubbed by default, and the open/close lifecycle here
      // runs entirely through their hooks.
      stubs: { transition: false, RouterLink: RouterLinkStub },
    },
  });
}

function panel() {
  return document.body.querySelector<HTMLElement>("[data-modal-panel]");
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("EntityDetailModal", () => {
  it("opens itself — a route-driven modal has no state to be told about", async () => {
    const wrapper = open();
    await flushPromises();

    expect(panel()).not.toBeNull();
    expect(panel()!.textContent).toContain("Ambrose Thistlefizz");
    expect(panel()!.textContent).toContain("Sheet body");
    wrapper.unmount();
  });

  it("names itself by its own heading", async () => {
    const wrapper = open();
    await flushPromises();

    const heading = panel()!.querySelector("h2")!;
    expect(panel()!.getAttribute("aria-labelledby")).toBe(heading.id);
    wrapper.unmount();
  });

  it("shows a spinner instead of an empty sheet while the entity loads", async () => {
    const wrapper = open({ loading: true });
    await flushPromises();

    expect(panel()!.textContent).not.toContain("Sheet body");
    wrapper.unmount();
  });

  /**
   * The ordering is the point: a caller that navigated the moment its control
   * was pressed would unmount this component mid-animation and the panel would
   * blink out. `close` means "the panel has gone, navigate now", which is what
   * lets the caller stay declarative about what closing means.
   *
   * With no Web Animations here the leave is instant, so what this can check is
   * the observable half — the panel is already off the page by the time the
   * caller is asked to act. `AppModal` covers the hook order itself.
   */
  it("asks the caller to navigate only once the panel has gone", async () => {
    const wrapper = open();
    await flushPromises();

    panel()!.querySelector<HTMLElement>('button[aria-label="Close"]')!.click();
    await flushPromises();

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(panel()).toBeNull();
    wrapper.unmount();
  });

  it("dismisses on Escape as well as on its own control", async () => {
    const wrapper = open();
    await flushPromises();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("hands its own scrolling to a body that manages two columns", async () => {
    const wrapper = open({ contained: true });
    await flushPromises();

    const body = panel()!.lastElementChild!;
    expect(body.classList.contains("lg:overflow-hidden")).toBe(true);
    wrapper.unmount();
  });

  it("scrolls the body itself by default", async () => {
    const wrapper = open();
    await flushPromises();

    const body = panel()!.lastElementChild!;
    expect(body.classList.contains("overflow-y-auto")).toBe(true);
    expect(body.classList.contains("lg:overflow-hidden")).toBe(false);
    wrapper.unmount();
  });
});
