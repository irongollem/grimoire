// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import ZoomControl from "./ZoomControl.vue";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";

function press(key: string) {
  const isMac = /Mac/.test(navigator.platform);
  document.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: isMac, ctrlKey: !isMac, bubbles: true, cancelable: true }));
}

let store: ReturnType<typeof useScriptoriumUiStore>;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  store = useScriptoriumUiStore();
  store.scriptoriumZoom = "fit";
  store.scriptoriumDrawnScale = 0.88;
});

describe("ZoomControl", () => {
  it("steps from the fitted size, not from 100%", async () => {
    const w = mount(ZoomControl, { attachTo: document.body });
    await w.get('[aria-label="Zoom in"]').trigger("click");
    expect(store.scriptoriumZoom).toBe(100);
    w.unmount();
  });

  it("stops the minus button at 50%", async () => {
    store.scriptoriumZoom = 50;
    const w = mount(ZoomControl, { attachTo: document.body });
    expect(w.get('[aria-label="Zoom out"]').attributes("disabled")).toBeDefined();
    w.unmount();
  });

  it("says Fit, then the percentage", async () => {
    const w = mount(ZoomControl, { attachTo: document.body });
    expect(w.get('[data-testid="zoom-menu"]').text()).toBe("Fit");
    store.scriptoriumZoom = 125;
    await w.vm.$nextTick();
    expect(w.get('[data-testid="zoom-menu"]').text()).toBe("125%");
    w.unmount();
  });

  it("Mod+1 shows the printed size and Mod+0 fits again", () => {
    const w = mount(ZoomControl, { attachTo: document.body });
    press("1");
    expect(store.scriptoriumZoom).toBe(100);
    press("0");
    expect(store.scriptoriumZoom).toBe("fit");
    w.unmount();
  });

  it("lets go of the keys when the book closes", () => {
    const w = mount(ZoomControl, { attachTo: document.body });
    w.unmount();
    press("1");
    expect(store.scriptoriumZoom).toBe("fit");
  });
});
