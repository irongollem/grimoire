// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount, type VueWrapper } from "@vue/test-utils";
import type { EncounterEvent } from "@/types/encounter.types";
import type { TrapEntry } from "@/types/trap.types";

const push = vi.fn();
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push }),
}));

import RunnerPhoneHeader from "./RunnerPhoneHeader.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";

const baseProps = {
  encounterId: "enc1",
  isLive: false,
  goingLive: false,
  canGoLive: true,
  canOpenBattleMap: true,
  battleMapDisabledReason: "No map yet",
  turnTimerSeconds: null,
  turnResetKey: "k",
};
const stubs = { RouterLink: { template: "<a><slot /></a>" }, TurnTimer: true };

function mountHeader(props: Partial<typeof baseProps> = {}) {
  return mount(RunnerPhoneHeader, { props: { ...baseProps, ...props }, global: { stubs }, attachTo: document.body });
}
async function openMenu(w: VueWrapper) {
  await w.find("[aria-label='More combat actions']").trigger("click");
}
const menuButton = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("[role=dialog] button")].find((b) => b.textContent?.includes(label));

const event = (id: string): EncounterEvent => ({ id, name: id, trigger: { type: "manual" }, actions: [], fire_once: true });

describe("RunnerPhoneHeader", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useEncounterRunStore().round = 0;
    push.mockReset();
    document.body.innerHTML = "";
  });

  // #1120: a second window follows the live fight, so before going live it
  // opened on an empty board with no tokens.
  it("offers the map in a new window only once the fight is live", async () => {
    const w = mountHeader({ isLive: false });
    await openMenu(w);
    expect(menuButton("Open map in a new window")!.disabled).toBe(true);
    w.unmount();
    document.body.innerHTML = "";

    const live = mountHeader({ isLive: true });
    await openMenu(live);
    menuButton("Open map in a new window")!.click();
    expect(live.emitted("battle-map-window")).toHaveLength(1);
  });

  // The old bar put End Combat one thumb-slip from Roll; on a phone it lives behind the menu.
  it("keeps End combat and Abandon out of the bar and last in the menu, behind a confirm-able emit", async () => {
    const w = mountHeader();
    expect(w.text()).not.toContain("End combat");
    expect(w.text()).not.toContain("Abandon");
    await openMenu(w);
    const labels = [...document.body.querySelectorAll("[role=dialog] button")].map((b) => b.textContent?.trim());
    expect(labels.slice(-2)).toEqual(["Abandon run", "End combat"]);
    menuButton("End combat")!.click();
    expect(w.emitted("end-combat")).toHaveLength(1);
    expect(w.emitted("abandon")).toBeUndefined();
  });

  it("labels the live toggle by state and hides it when there is no campaign to go live to", async () => {
    const live = mountHeader({ isLive: true });
    expect(live.text()).toContain("Live");
    await openMenu(live);
    expect(menuButton("Stop live")).toBeDefined();
    live.unmount();
    document.body.innerHTML = "";
    const none = mountHeader({ canGoLive: false });
    await openMenu(none);
    expect(menuButton("Go live")).toBeUndefined();
    expect(menuButton("Stop live")).toBeUndefined();
  });

  it("disables the battle map with its reason and offers no second window when it cannot open", async () => {
    const w = mountHeader({ canOpenBattleMap: false });
    await openMenu(w);
    expect(menuButton("Battle map")!.disabled).toBe(true);
    expect(menuButton("new window")).toBeUndefined();
  });

  it("offers Roll initiative only before combat starts", async () => {
    const store = useEncounterRunStore();
    const pre = mountHeader();
    await openMenu(pre);
    expect(menuButton("Roll initiative")).toBeDefined();
    pre.unmount();
    document.body.innerHTML = "";
    store.started = true;
    const after = mountHeader();
    await openMenu(after);
    expect(menuButton("Roll initiative")).toBeUndefined();
  });

  it("opens the manual page from the menu", async () => {
    const w = mountHeader();
    await openMenu(w);
    menuButton("How the runner works")!.click();
    expect(push).toHaveBeenCalledWith({ path: "/rules", query: { tab: "manual", page: "encounter-runner" } });
  });

  it("badges Combat tools with unfired events plus traps, and shows nothing at zero", async () => {
    const store = useEncounterRunStore();
    const w = mountHeader();
    expect(w.find("[data-testid=tools-badge]").exists()).toBe(false);
    store.events = [event("e1"), event("e2"), event("e3")];
    store.eventsFired = ["e2"];
    store.traps = [{ id: "t1" } as TrapEntry];
    await w.vm.$nextTick();
    expect(w.find("[data-testid=tools-badge]").text()).toBe("3");
  });
});
