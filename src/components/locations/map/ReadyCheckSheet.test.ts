import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReadyCheckSheet from "./ReadyCheckSheet.vue";
import type { ReadyRow } from "@/lib/locations/playReadiness";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  encounters: { value: [] as { id: string; name: string; location_id: string | null; is_finished: boolean; combatants: unknown[] }[] },
}));

vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/encounters/useEncounters", () => ({
  useEncounters: () => ({ data: ref(mocks.encounters.value) }),
  useCreateEncounter: () => ({ mutateAsync: mocks.create }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

const rows: ReadyRow[] = [
  { id: "doors", label: "Doors", detail: "2 doors.", status: "gap", fixes: [{ label: "Place it", action: { kind: "place-door", doorId: "d2" }, subject: "Crypt to Gallery" }] },
  { id: "light", label: "Light", detail: "Dim", status: "ok", fixes: [{ label: "Change", action: { kind: "light" } }] },
];

let wrapper: VueWrapper;
function mountSheet(over: Record<string, unknown> = {}) {
  wrapper = mount(ReadyCheckSheet, {
    attachTo: document.body,
    props: { open: true, darkness: "dim", rows, mapName: "Ash Keep", siteId: "site-1", siteName: "Ash Keep", roomIds: ["room-1"], firstRoomName: "The Crypt", ...over },
    global: { stubs: { EntityCombobox: true } },
  });
  return wrapper;
}
const body = () => document.body;
const button = (label: string) => [...body().querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label)!;
const radio = (value: string) => body().querySelector<HTMLInputElement>(`input[value="${value}"]`)!;

beforeEach(() => {
  mocks.push.mockReset();
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({ id: "enc-new" });
  mocks.encounters.value = [];
});
afterEach(() => wrapper.unmount());

// #1125 decision 16 / frame 08.
describe("ReadyCheckSheet", () => {
  it("Place it hands the editor that door and gets out of the way of the map", async () => {
    mountSheet();
    button("Place it: Crypt to Gallery").click();
    await flushPromises();
    expect(wrapper.emitted("fix")).toEqual([[{ kind: "place-door", doorId: "d2" }]]);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
  });

  it("Change on Light stays on the sheet and sets the light from the sheet", async () => {
    mountSheet();
    button("Change").click();
    await flushPromises();
    expect(wrapper.emitted("fix")).toBeUndefined();
    expect(wrapper.emitted("update:open")).toBeUndefined();
    button("Dark").click();
    await flushPromises();
    expect(wrapper.emitted("update:darkness")).toEqual([["dark"]]);
  });

  it("Start the fight with a new encounter creates one linked to the site, then runs it", async () => {
    mountSheet();
    button("Start the fight").click();
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ location_id: "site-1", is_finished: false }));
    expect(mocks.push).toHaveBeenCalledWith("/encounters/enc-new/run");
  });

  it("a fight already staged here is run, not duplicated", async () => {
    mocks.encounters.value = [{ id: "enc-1", name: "Ghouls", location_id: "room-1", is_finished: false, combatants: [{}, {}, {}] }];
    mountSheet();
    expect(body().textContent).toContain("3 foes wait in a tray");
    button("Start the fight").click();
    await flushPromises();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/encounters/enc-1/run");
  });

  it("a finished fight or one elsewhere is not offered", () => {
    mocks.encounters.value = [
      { id: "old", name: "Done", location_id: "site-1", is_finished: true, combatants: [] },
      { id: "far", name: "Far", location_id: "elsewhere", is_finished: false, combatants: [] },
    ];
    mountSheet();
    expect(wrapper.findComponent({ name: "EntityCombobox" }).props("options")).toEqual([{ id: "new", name: "a new encounter" }]);
  });

  it("the primary button follows the choice: Explore and Show the table go to their screens", async () => {
    mountSheet();
    radio("explore").click();
    await flushPromises();
    expect(button("Explore")).toBeTruthy();
    expect(button("Start the fight")).toBeUndefined();
    button("Explore").click();
    expect(mocks.push).toHaveBeenLastCalledWith("/locations/site-1/explore");
    radio("show").click();
    await flushPromises();
    button("Show the table").click();
    expect(mocks.push).toHaveBeenLastCalledWith("/locations/site-1/table");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("says where the party starts", () => {
    mountSheet();
    expect(body().textContent).toContain("The party starts in The Crypt.");
  });

  // Teleported to body, a sheet that leaves focus behind lets a screen-reader or keyboard user wander the page it covers.
  describe("focus", () => {
    const panel = () => body().querySelector<HTMLElement>(".ready-panel")!;

    it("takes focus into the sheet when it opens", async () => {
      mountSheet();
      await flushPromises();
      expect(document.activeElement).toBe(panel());
    });

    it("hands focus back to what opened it when it closes", async () => {
      const opener = document.createElement("button");
      document.body.append(opener);
      opener.focus();
      mountSheet({ open: false });
      await wrapper.setProps({ open: true });
      await flushPromises();
      expect(document.activeElement).toBe(panel());
      await wrapper.setProps({ open: false });
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it("wraps Tab from the last control back to the first instead of leaving the sheet", async () => {
      // jsdom has no layout, so every element reads as hidden to the trap; make them all rendered.
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
      Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: () => document.body });
      mountSheet();
      await flushPromises();
      const items = [...panel().querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
      items[items.length - 1].focus();
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      items[items.length - 1].dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(items[0]);
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
    });

    it("closes on Escape", async () => {
      mountSheet();
      await flushPromises();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flushPromises();
      expect(wrapper.emitted("update:open")).toEqual([[false]]);
    });
  });
});
