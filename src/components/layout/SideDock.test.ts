// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";
import { useAppUiStore } from "@/stores/ui/app";
import { useAskUiStore } from "@/stores/ui/ask";

const wide = ref(false);
const canAsk = ref(true);
vi.mock("@vueuse/core", async (importOriginal) => ({ ...(await importOriginal<object>()), useMediaQuery: () => wide }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<object>()), useAbove: () => ref(true) }));
vi.mock("@/composables/ask/useCanAsk", () => ({ useCanAsk: () => canAsk }));
vi.mock("@/lib/motion", () => ({ railTransition: () => ({}) }));

import SideDock from "./SideDock.vue";

const mountDock = (props: { contained?: boolean } = {}) => mount(SideDock, { props, global: { stubs: { Transition: false } } });

describe("SideDock", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    wide.value = false;
    canAsk.value = true;
  });

  // Bug caught: chat and the Familiar open together again, as two columns.
  it("opening the chat closes the Familiar, and the reverse", async () => {
    const appUi = useAppUiStore();
    const ask = useAskUiStore();
    const w = mountDock();
    ask.openPanel();
    await nextTick();
    appUi.chatOpen = true;
    await nextTick();
    expect(ask.open).toBe(false);
    expect(appUi.chatOpen).toBe(true);
    ask.openPanel();
    await nextTick();
    expect(appUi.chatOpen).toBe(false);
    expect(ask.open).toBe(true);
    w.unmount();
  });

  // Bug caught: a tab that opens its own body without closing the other leaves two bodies claiming the dock.
  it("a tab opens its own and closes the other", async () => {
    const appUi = useAppUiStore();
    const ask = useAskUiStore();
    appUi.chatOpen = true;
    const w = mountDock();
    await w.get('[data-testid="side-dock-tab-familiar"]').trigger("click");
    expect(ask.open).toBe(true);
    expect(appUi.chatOpen).toBe(false);
    await w.get('[data-testid="side-dock-tab-chat"]').trigger("click");
    expect(appUi.chatOpen).toBe(true);
    expect(ask.open).toBe(false);
    w.unmount();
  });

  // Bug caught: the unread dot lost with the chat's own column, so a DM in the Familiar never learns a message came.
  it("shows the unread dot on the Chat tab only when there is unread", async () => {
    const appUi = useAppUiStore();
    const ask = useAskUiStore();
    ask.openPanel();
    appUi.chatHasUnread = true;
    const w = mountDock();
    expect(w.find('[data-testid="side-dock-tab-chat"] [data-testid="side-dock-unread"]').exists()).toBe(true);
    appUi.chatHasUnread = false;
    await nextTick();
    expect(w.find('[data-testid="side-dock-unread"]').exists()).toBe(false);
    w.unmount();
  });

  // Bug caught: Close shutting only the chat, leaving the Familiar's column up (or the reverse).
  it("the close button closes whichever is open", async () => {
    const ask = useAskUiStore();
    const appUi = useAppUiStore();
    ask.openPanel();
    const w = mountDock();
    await w.get('[data-testid="side-dock-close"]').trigger("click");
    expect(ask.open).toBe(false);
    appUi.chatOpen = true;
    await nextTick();
    await w.get('[data-testid="side-dock-close"]').trigger("click");
    expect(appUi.chatOpen).toBe(false);
    await nextTick();
    expect(w.find('[data-testid="side-dock"]').exists()).toBe(false);
    w.unmount();
  });

  // Bug caught: the dock always in the flow (squashing a 1100px page) or always floating (covering it on a wide screen).
  it("pushes the page when there is room and slides over it when there is not", async () => {
    useAppUiStore().chatOpen = true;
    const w = mountDock();
    expect(w.get('[data-testid="side-dock"]').attributes("data-mode")).toBe("overlay");
    expect(w.get('[data-testid="side-dock"]').classes()).toContain("fixed");
    wide.value = true;
    await nextTick();
    expect(w.get('[data-testid="side-dock"]').attributes("data-mode")).toBe("push");
    expect(w.get('[data-testid="side-dock"]').classes()).not.toContain("fixed");
    w.unmount();
  });

  // Bug caught: the player's column (no room check, no Familiar) floating over the page like the DM's on a narrow screen.
  it("stays in the flow when contained, and offers no Familiar tab to someone who cannot ask", () => {
    canAsk.value = false;
    useAppUiStore().chatOpen = true;
    const w = mountDock({ contained: true });
    expect(w.get('[data-testid="side-dock"]').attributes("data-mode")).toBe("push");
    expect(w.find('[data-testid="side-dock-tab-familiar"]').exists()).toBe(false);
    w.unmount();
  });

  // Bug caught: the dock opened from inside a modal sheet sat behind its backdrop, dimmed and unclickable.
  it("publishes its width while it is on screen, so a modal keeps clear of it, and takes it back when it closes", async () => {
    const ask = useAskUiStore();
    const w = mountDock();
    expect(document.documentElement.style.getPropertyValue("--dock-right")).toBe("");
    ask.openPanel();
    await nextTick();
    expect(document.documentElement.style.getPropertyValue("--dock-right")).toBe("26rem");
    ask.closePanel();
    await nextTick();
    expect(document.documentElement.style.getPropertyValue("--dock-right")).toBe("");
    w.unmount();
  });

  it("a contained dock (the player layout) leaves modals the whole screen", async () => {
    useAskUiStore().openPanel();
    const w = mountDock({ contained: true });
    await nextTick();
    expect(document.documentElement.style.getPropertyValue("--dock-right")).toBe("");
    w.unmount();
  });
});
