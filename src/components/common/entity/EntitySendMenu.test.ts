import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import EntitySendMenu from "./EntitySendMenu.vue";

function panel() {
  // Teleported to <body>, and labelled rather than `role="menu"` — the panel
  // holds two ordinary tab-reachable buttons, not a roving-focus ARIA menu.
  return document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Send to…"]');
}

function open(props: Record<string, unknown> = {}) {
  return mount(EntitySendMenu, { props, attachTo: document.body });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("EntitySendMenu", () => {
  it("keeps the panel out of the DOM until the trigger is clicked", async () => {
    const wrapper = open();

    expect(panel()).toBeNull();

    await wrapper.get("button").trigger("click");
    expect(panel()).not.toBeNull();
    wrapper.unmount();
  });

  it("emits scriptorium and closes the panel when that row is clicked", async () => {
    const wrapper = open();
    await wrapper.get("button").trigger("click");

    const rows = panel()!.querySelectorAll("button");
    rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("scriptorium")).toHaveLength(1);
    expect(panel()).toBeNull();
    wrapper.unmount();
  });

  it("emits copy and closes the panel when that row is clicked", async () => {
    const wrapper = open();
    await wrapper.get("button").trigger("click");

    const rows = panel()!.querySelectorAll("button");
    rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("copy")).toHaveLength(1);
    expect(panel()).toBeNull();
    wrapper.unmount();
  });

  /**
   * The trigger is a `PageHeaderAction`, so its label collapses to icon-only
   * below `lg` by default — right inside a `PageHeader`, wrong beside the
   * always-labelled buttons in MonsterDetail's and SpellDetailHeader's action
   * rows, where one icon-only control among labelled ones reads as a bug
   * rather than a choice (#895). The prop is the only thing keeping those two
   * call sites honest, so it gets cover rather than being trusted to
   * pass-through by inspection.
   */
  it("collapses the trigger label below lg by default", () => {
    const wrapper = open();

    expect(wrapper.get("button").html()).toContain("max-lg:hidden");
    wrapper.unmount();
  });

  it("keeps the trigger label at every width when collapseLabelOnMobile is false", () => {
    const wrapper = open({ collapseLabelOnMobile: false });

    const trigger = wrapper.get("button");
    expect(trigger.html()).not.toContain("max-lg:hidden");
    expect(trigger.text()).toContain("Send to…");
    wrapper.unmount();
  });

  it("disables the Scriptorium row and renames it while exporting", async () => {
    const wrapper = open({ sendingToScriptorium: true });
    await wrapper.get("button").trigger("click");

    const scriptoriumRow = panel()!.querySelectorAll("button")[0];
    expect(scriptoriumRow.textContent).toContain("Exporting…");
    expect(scriptoriumRow.hasAttribute("disabled")).toBe(true);
    wrapper.unmount();
  });
});
