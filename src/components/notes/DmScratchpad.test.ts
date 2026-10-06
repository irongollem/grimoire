import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useScratchpadStore } from "@/stores/scratchpad";
import { useAuthStore } from "@/stores/auth";
import DmScratchpad from "./DmScratchpad.vue";

const touchState = vi.hoisted(() => ({ touches: null as unknown, label: null as unknown }));

vi.mock("@/composables/notes/useDmNoteTouches", () => ({
  useDmNoteTouches: () => ({ touches: touchState.touches, label: touchState.label, loading: { value: false } }),
}));

const stubs = {
  Teleport: true,
  DmNoteBox: { props: ["type", "id", "label", "variant"], template: "<div data-test='box'>{{ type }}:{{ id }}:{{ variant }}</div>" },
  AppButton: {
    props: ["to", "label", "ariaLabel", "active"],
    template: "<button :data-to='JSON.stringify(to)' :aria-label='ariaLabel' :data-active='active'>{{ label }}<slot /></button>",
  },
};

function setup({ dm = true, open = true } = {}) {
  setActivePinia(createPinia());
  touchState.touches = ref([]);
  touchState.label = ref(null);
  const auth = useAuthStore();
  Object.defineProperty(auth, "isDM", { value: dm });
  const store = useScratchpadStore();
  store.open = open;
  return { store };
}

const npc = { type: "npc", id: "n1", label: "Brenna" } as const;
const place = { type: "location", id: "l1", label: "Mill" } as const;

const mountPanel = () => mount(DmScratchpad, { global: { stubs: { ...stubs, Transition: false } } });

describe("DmScratchpad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the page subject's note with its type label", () => {
    const { store } = setup();
    store.register({ ...npc });
    const w = mountPanel();
    expect(w.find("[data-test=title]").text()).toBe("Brenna");
    expect(w.find("[data-test=kind]").text()).toContain("NPC");
    expect(w.find("[data-test=box]").text()).toBe("npc:n1:panel");
  });

  it("shows the empty state when no entity is on screen", () => {
    setup();
    const w = mountPanel();
    expect(w.find("[data-test=empty]").text()).toContain("DM notes appear here");
    expect(w.find("[data-test=box]").exists()).toBe(false);
  });

  it("pins the shown subject and offers a switch once the page moves on", async () => {
    const { store } = setup();
    store.register({ ...npc });
    const w = mountPanel();
    expect(w.find("[data-test=switch]").exists()).toBe(false);
    await w.find("[data-test=pin]").trigger("click");
    expect(store.pinned).toEqual(npc);

    store.register({ ...place });
    await w.vm.$nextTick();
    expect(w.find("[data-test=title]").text()).toBe("Brenna");
    const sw = w.find("[data-test=switch]");
    expect(sw.text()).toContain("Switch to Mill");

    await sw.trigger("click");
    expect(store.pinned).toBeNull();
    await w.vm.$nextTick();
    expect(w.find("[data-test=title]").text()).toBe("Mill");
  });

  it("unpins from the pin button when already pinned", async () => {
    const { store } = setup();
    store.register({ ...npc });
    store.pin();
    const w = mountPanel();
    await w.find("[data-test=pin]").trigger("click");
    expect(store.pinned).toBeNull();
  });

  it("lists touched entities with links and marks the one on show", () => {
    const { store } = setup();
    store.register({ ...npc });
    touchState.label = ref("This session");
    touchState.touches = ref([
      { id: "t1", entity_type: "npc", entity_id: "n1", entity_label: "Brenna", touched_at: new Date().toISOString() },
      { id: "t2", entity_type: "monster", entity_id: "m1", entity_label: "Owlbear", touched_at: new Date().toISOString() },
    ]);
    const w = mountPanel();
    expect(w.find("[data-test=touched]").text()).toContain("This session");
    const rows = w.findAll("[data-test=touch]");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.attributes("data-to")).toBe('"/npcs/n1"');
    expect(rows[0]!.text()).toContain("Showing now");
    expect(rows[1]!.attributes("data-to")).toBe('"/monsters/m1"');
    expect(rows[1]!.text()).toContain("Monster");
  });

  it("hides the touched section when there is no session window", () => {
    setup();
    const w = mountPanel();
    expect(w.find("[data-test=touched]").exists()).toBe(false);
  });

  it("renders nothing for an account that is not the campaign's DM", () => {
    setup({ dm: false });
    expect(mountPanel().find("[data-test=dm-scratchpad]").exists()).toBe(false);
  });

  it("renders nothing while closed", () => {
    setup({ open: false });
    expect(mountPanel().find("[data-test=dm-scratchpad]").exists()).toBe(false);
  });

  it("closes from the close button", async () => {
    const { store } = setup();
    const w = mountPanel();
    await w.find("[data-test=close]").trigger("click");
    expect(store.open).toBe(false);
  });
});
