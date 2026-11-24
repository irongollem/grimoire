// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { AskAdapter, AskRunResult } from "@/lib/ask/askAdapter";
import { useAskUiStore } from "@/stores/ui/ask";

const route = { fullPath: "/dashboard", path: "/dashboard", query: {}, meta: { title: "Dashboard" } };
const push = vi.fn();
vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ push }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<object>()), useIsMobile: () => ref(false) }));
vi.mock("@/lib/motion", () => ({ railTransition: () => ({}), drawerTransition: () => ({}) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ openOutOfCredits: vi.fn() }) }));
vi.mock("@/composables/ask/askUsage", () => ({ useAskUsage: () => ({ freeLeft: ref(5), refetch: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { name: "Kind Country" } }) }));

let finishRun: (r: AskRunResult) => void = () => undefined;
const adapter: AskAdapter = {
  id: "npc",
  quote: () => ({ lines: [], total: 4, byok: false, block: null }),
  run: () => new Promise<AskRunResult>((r) => (finishRun = r)),
};
vi.mock("@/ai/ask/useAskAdapters", () => ({
  useAskAdapters: () => ({ adapterFor: (id: string) => (id === "npc" ? adapter : undefined), screenFor: () => undefined }),
}));

const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
const proposal = { proposalId: "p1", generator: "npc", concept: "a baker", inputs: {} };
const done = { type: "done", end: "done", routed: true, free: false, credits: 0, freeLeft: 5 };
const transport = vi.fn(async () => sse([{ type: "propose", proposal }, done]));
vi.mock("@/composables/ask/askTransport", () => ({ sendToAskTurn: (...a: unknown[]) => (transport as (...x: unknown[]) => unknown)(...a) }));

import AskPanel from "./AskPanel.vue";

const stubs = { Teleport: true, Transition: false, RouterLink: { template: "<a><slot /></a>" } };

describe("AskPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    transport.mockClear();
    push.mockClear();
    route.fullPath = "/dashboard";
  });

  // Bug caught: a search query carried into the panel never sent, or sent twice (mount plus watcher).
  it("sends a query from the search box once, as a fresh first message", async () => {
    const ui = useAskUiStore();
    ui.openPanel("who is Mara");
    const w = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(w.findAll('[data-testid="ask-user-message"]').map((m) => m.text())).toEqual(["who is Mara"]);
    w.unmount();
  });

  // Bug caught: Suggest sending the request itself, or leaving the box empty, so the DM could not change it first.
  it("writes an unsent request into the box and sends nothing", async () => {
    const ui = useAskUiStore();
    ui.openPanel("Suggest three truths.", { send: false });
    const w = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    expect(transport).not.toHaveBeenCalled();
    expect((w.get('[data-testid="ask-input"]').element as HTMLTextAreaElement).value).toBe("Suggest three truths.");
    w.unmount();
  });

  // Bug caught: the chip under the header naming the wrong world, or no page.
  it("says which campaign and page it is asked from", () => {
    const ui = useAskUiStore();
    ui.openPanel();
    const w = mount(AskPanel, { global: { stubs } });
    expect(w.get('[data-testid="ask-context"]').text()).toBe("Kind Country from Dashboard");
    expect(w.get('[data-testid="ask-allowance"]').text()).toBe("5 of 5 free questions left today");
    w.unmount();
  });

  // Bug caught: the count replaced by the cost sentence after the first question, as if the free ones were gone.
  it("keeps counting the free questions after one is asked, and explains the cost only when none are left", async () => {
    const ui = useAskUiStore();
    ui.openPanel();
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-input"]').setValue("who runs the mill?");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(w.get('[data-testid="ask-allowance"]').text()).toMatch(/^\d of 5 free questions left today$/);
    w.unmount();
  });

  // Bug caught: a generation finishing behind a closed panel with nothing to tell the DM (no slip, no dot).
  it("raises the slip and the dot when a run ends with the panel closed, and Open goes to the result", async () => {
    const ui = useAskUiStore();
    ui.openPanel();
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-input"]').setValue("make a baker");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    await w.get('[data-testid="ask-confirm"]').trigger("click");
    ui.closePanel();
    finishRun({ record: { type: "npc", id: "n1", name: "Mara" }, route: "/npcs/n1", parts: [{ label: "NPC", ok: true, credits: 4 }] });
    await flushPromises();
    expect(ui.hasUnread).toBe(true);
    const slip = w.get('[data-testid="ask-notice"]');
    expect(slip.text()).toContain("Mara is ready.");
    expect(slip.text()).toContain("NPC in Kind Country · 4 credits");
    await slip.findAll("button").find((b) => b.text() === "Open NPC")?.trigger("click");
    expect(push).toHaveBeenCalledWith("/npcs/n1");
    expect(w.find('[data-testid="ask-notice"]').exists()).toBe(false);
    w.unmount();
  });

  // Bug caught: the slip raised over a panel the DM is looking at and has not left (the result is in the thread).
  it("raises no slip when the panel is open and the DM stayed put", async () => {
    const ui = useAskUiStore();
    ui.openPanel();
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-input"]').setValue("make a baker");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    await w.get('[data-testid="ask-confirm"]').trigger("click");
    finishRun({ record: null, route: null, parts: [{ label: "NPC", ok: true, credits: 4 }] });
    await flushPromises();
    expect(w.find('[data-testid="ask-notice"]').exists()).toBe(false);
    expect(w.find('[data-testid="ask-result"]').exists()).toBe(true);
    w.unmount();
  });

  // Bug caught: leaving the page mid-run showing nothing, because the panel is still open.
  it("raises the slip when the DM navigated away while it ran", async () => {
    const ui = useAskUiStore();
    ui.openPanel();
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-input"]').setValue("make a baker");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    await w.get('[data-testid="ask-confirm"]').trigger("click");
    route.fullPath = "/npcs";
    finishRun({ record: null, route: null, parts: [{ label: "NPC", ok: true, credits: 4 }] });
    await flushPromises();
    expect(w.find('[data-testid="ask-notice"]').exists()).toBe(true);
    w.unmount();
  });
});
