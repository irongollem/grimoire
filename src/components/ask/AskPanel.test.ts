// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";
import type { AnyAskAdapter, AskAdapter, AskRunResult } from "@/lib/ask/askAdapter";
import type { User } from "@supabase/supabase-js";
import { useAuthStore } from "@/stores/auth";
import { useAskUiStore } from "@/stores/ui/ask";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";

const route: { fullPath: string; path: string; name?: string; query: object; meta: { title: string } } = { fullPath: "/dashboard", path: "/dashboard", query: {}, meta: { title: "Dashboard" } };
const push = vi.fn();
const replace = vi.fn();
vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ push, replace }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<object>()), useIsMobile: () => ref(false) }));
vi.mock("@/lib/motion", () => ({ railTransition: () => ({}), drawerTransition: () => ({}), prefersReducedMotion: () => true }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ openOutOfCredits: vi.fn() }) }));
vi.mock("@/composables/ask/askUsage", () => ({ useAskUsage: () => ({ freeLeft: ref(5), refetch: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { name: "Kind Country" } }) }));

let finishRun: (r: AskRunResult) => void = () => undefined;
const adapter: AskAdapter = {
  id: "npc",
  quote: () => ({ lines: [], total: 4, block: null }),
  run: () => new Promise<AskRunResult>((r) => (finishRun = r)),
};
let current: AnyAskAdapter = adapter;
const confirmStartOver = vi.fn(async (_message: string) => true);
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: confirmStartOver }) }));
vi.mock("@/ai/ask/useAskAdapters", () => ({
  useAskAdapters: () => ({ adapterFor: (id: string) => (id === "npc" ? current : undefined), hasAdapter: () => false, loadAdapter: async () => undefined, screenFor: () => undefined }),
}));

const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
const proposal = { proposalId: "p1", generator: "npc", concept: "a baker", inputs: {} };
const done = { type: "done", end: "done", routed: true, free: false, credits: 0, freeLeft: 5 };
const transport = vi.fn(async () => sse([{ type: "propose", proposal }, done]));
vi.mock("@/composables/ask/askTransport", () => ({ sendToAskTurn: (...a: unknown[]) => (transport as (...x: unknown[]) => unknown)(...a) }));

const rates = ref<{ on: boolean; perMinute: { elevenlabs: number | null; inworld: number | null } } | undefined>({ on: true, perMinute: { elevenlabs: 6, inworld: null } });
vi.mock("@/composables/table/useTableVoice", async (importOriginal) => ({ ...(await importOriginal<object>()), useTableVoiceRates: () => ({ data: rates }) }));
const voiceTransport = vi.fn(async () => new Response(JSON.stringify({ audio: "AAAA", mime: "audio/mpeg" })));
vi.mock("@/composables/ask/useFamiliarVoice", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/composables/ask/useFamiliarVoice")>();
  return { ...real, useFamiliarVoice: () => real.useFamiliarVoice({ transport: voiceTransport as never, player: (src) => voicePlayer(src) }) };
});
// Plays at once by default; a test that needs a reply still playing swaps in one that never ends by itself.
const stoppedClips: string[] = [];
let voicePlayer = (_src: string) => ({ done: Promise.resolve(), stop: () => undefined as void });

import FamiliarAvatar from "@/components/ask/FamiliarAvatar.vue";
vi.mock("@/composables/canon/useStatBlockBinding", () => ({ useStatBlockBinder: () => async () => ({ ok: true, text: "" }) }));
vi.mock("@/composables/ask/useAskWalkPorts", async () => {
  const { fakeWalkPorts } = await import("@/test/askWalkPorts");
  return { useAskWalkPorts: () => fakeWalkPorts().ports };
});
// The progress line reads the skips it can bring back; no canon is behind this panel.
vi.mock("@/composables/canon/useCanonWalkSkips", () => ({ useCanonWalkSkipActions: () => ({ bringBack: { mutate: vi.fn() } }) }));
vi.mock("@/components/ask/AskGreeting.vue", () => ({ default: { template: '<p data-testid="ask-greeting-stub" />' } }));

import AskPanel from "./AskPanel.vue";

/** "Design it with me" asks how first: the walk begins on this press. */
async function pickSections(w: ReturnType<typeof mount>) {
  await w.get("[data-testid=walk-way-sections]").trigger("click");
  await flushPromises();
}

let accounts = 0;
const stubs = { Teleport: true, Transition: false, RouterLink: { template: "<a><slot /></a>" } };

describe("AskPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    current = adapter;
    confirmStartOver.mockClear().mockResolvedValue(true);
    transport.mockClear();
    push.mockClear();
    replace.mockClear();
    route.fullPath = "/dashboard";
    route.name = undefined;
    voiceTransport.mockClear();
    stoppedClips.length = 0;
    voicePlayer = () => ({ done: Promise.resolve(), stop: () => undefined });
    rates.value = { on: true, perMinute: { elevenlabs: 6, inworld: null } };
    // The switch is remembered per account for the life of the module: a fresh account starts every test off.
    useAuthStore().user = { id: `u${++accounts}` } as User;
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

  // Bug caught: the Canon's "Design it with me" opening the panel and leaving the walk waiting in the store, so nothing
  // is asked; or the request taken twice (a remount) and the walk started twice.
  it("starts the walk once when a page asks for it, and asks the model nothing", async () => {
    const ui = useAskUiStore();
    ui.openWalk();
    const w = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    expect(ui.pendingWalk).toBe(false);
    // Nothing is asked until the DM chooses a way.
    expect(w.find("[data-testid=walk-progress]").exists()).toBe(false);
    await pickSections(w);
    expect(w.text()).toContain("design your campaign together");
    // The walk is drawn in the pane: its progress line, and the first question as a block of the thread.
    expect(w.find("[data-testid=walk-progress]").exists()).toBe(true);
    expect(w.find("[data-testid=walk-question]").exists()).toBe(true);
    expect(transport).not.toHaveBeenCalled();
    w.unmount();
  });

  // Bug caught: a walk question asked with the focus elsewhere (on the button just pressed, or the page), so the DM's
  // answer typed straight away fired the page's shortcuts instead (a live run opened the sound deck that way).
  it("puts the focus in the box each time the walk asks a question", async () => {
    const ui = useAskUiStore();
    ui.openWalk();
    const opened = ui.focusRequest;
    const w = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    await pickSections(w);
    expect(w.find("[data-testid=walk-question]").exists()).toBe(true);
    expect(ui.focusRequest).toBeGreaterThan(opened);
    w.unmount();
  });

  // Bug caught: the follow-up asked about the same stop as the question before it, so the focus watcher (keyed on the
  // stop) stayed quiet and the DM's answer typed straight away landed on the page's shortcuts.
  it("puts the focus back in the box when a thin answer is followed up", async () => {
    const ui = useAskUiStore();
    ui.openWalk();
    const w = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    await pickSections(w);
    const before = ui.focusRequest;
    await w.get('[data-testid="ask-input"]').setValue("A drowned kingdom");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(w.findAll("[data-testid=walk-question]")).toHaveLength(2);
    expect(ui.focusRequest).toBeGreaterThan(before);
    w.unmount();
  });

  // Bug caught: the page behind staying put while the Familiar asks about a section (the DM cannot see what is being
  // written); or a DM who went to another page being pulled back to the Canon by the next question.
  it("brings the asked section's chapter into view on the Canon, and nowhere else", async () => {
    route.name = "canon";
    useAskUiStore().openWalk();
    const onCanon = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    await pickSections(onCanon);
    expect(replace).toHaveBeenCalledWith("/canon/premise");
    onCanon.unmount();

    replace.mockClear();
    route.name = "npcs";
    useAskUiStore().openWalk();
    const elsewhere = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    await pickSections(elsewhere);
    expect(replace).not.toHaveBeenCalled();
    elsewhere.unmount();
  });

  // Bug caught: the interview's button (or its line) not wired: Turn this into my canon opening the import without the
  // DM's words, or an interview turn sent as an ordinary one, or the line still shown after leaving.
  it("tells the story as an interview, then Turn this into my canon opens the import with it", async () => {
    const ui = useAskUiStore();
    ui.openWalk();
    const w = mount(AskPanel, { global: { stubs } });
    await flushPromises();
    await w.get("[data-testid=walk-way-story]").trigger("click");
    await flushPromises();
    expect(w.find("[data-testid=interview-line]").exists()).toBe(true);
    expect(w.get("[data-testid=interview-turn]").attributes("disabled")).toBeDefined();
    expect(w.get('[data-testid="ask-input"]').attributes("placeholder")).toBe("Tell me about your campaign, in any order");
    await w.get('[data-testid="ask-input"]').setValue("A drowned kingdom");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ mode: "interview" }), expect.anything());
    await w.get("[data-testid=interview-turn]").trigger("click");
    expect(push).toHaveBeenCalledWith("/canon/import");
    const offer = useAskPrefillStore().takeOffer("document_import");
    expect(offer?.text).toContain("I said: A drowned kingdom");
    await w.get("[data-testid=interview-leave]").trigger("click");
    expect(w.find("[data-testid=interview-line]").exists()).toBe(false);
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

  async function askAndConfirm(w: ReturnType<typeof mount>) {
    await w.get('[data-testid="ask-input"]').setValue("make a baker");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
    await w.get('[data-testid="ask-confirm"]').trigger("click");
    await flushPromises();
  }

  // Bug caught: New conversation during a run wiping the thread its result and its credits belong to.
  it("disables New conversation while a run is in flight, and frees it when it ends", async () => {
    useAskUiStore().openPanel();
    const w = mount(AskPanel, { global: { stubs } });
    await askAndConfirm(w);
    expect(w.get('[data-testid="ask-new"]').attributes("disabled")).toBeDefined();
    await w.get('[data-testid="ask-new"]').trigger("click");
    expect(w.find('[data-testid="ask-pending"]').exists()).toBe(true);
    // A question from the search box takes the same path: it joins the thread rather than wiping it.
    useAskUiStore().openPanel("who is Mara");
    await flushPromises();
    expect(w.find('[data-testid="ask-pending"]').exists()).toBe(true);
    finishRun({ record: null, route: null, parts: [{ label: "NPC", ok: true, credits: 4 }] });
    await flushPromises();
    expect(w.get('[data-testid="ask-new"]').attributes("disabled")).toBeUndefined();
    w.unmount();
  });

  // Bug caught: New conversation silently discarding a generation the DM paid for and had not yet saved.
  it("asks before it throws away a generation awaiting Create, and keeps it on a no", async () => {
    current = {
      id: "npc",
      quote: () => ({ lines: [], total: 4, block: null }),
      preview: async () => ({ ok: true, preview: { shown: { title: "Mara", sections: [] }, parts: [{ label: "NPC", ok: true, credits: 4 }], create: async () => ({ record: null, route: null, parts: [] }) } }),
    };
    useAskUiStore().openPanel();
    const w = mount(AskPanel, { global: { stubs } });
    await askAndConfirm(w);
    expect(w.find('[data-testid="ask-preview"]').exists()).toBe(true);
    confirmStartOver.mockResolvedValueOnce(false);
    await w.get('[data-testid="ask-new"]').trigger("click");
    await flushPromises();
    expect(confirmStartOver.mock.calls[0][0]).toContain("Discard the NPC you have not saved?");
    expect(w.find('[data-testid="ask-preview"]').exists()).toBe(true);
    await w.get('[data-testid="ask-new"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="ask-preview"]').exists()).toBe(false);
    w.unmount();
  });

  const ask = async (w: ReturnType<typeof mount>) => {
    await w.get('[data-testid="ask-input"]').setValue("who runs the mill?");
    await w.get('[data-testid="ask-input"]').trigger("keydown", { key: "Enter" });
    await flushPromises();
  };

  // Bug caught: Ooru reading aloud (a paid call) before anyone asked for it, or the toggle shown pressed.
  it("shows Ooru's switch off by default, with the price, and asks the voice for nothing", async () => {
    useAskUiStore().openPanel();
    transport.mockResolvedValueOnce(sse([{ type: "session", sessionId: "s1" }, { type: "text", delta: "Harl runs it." }, done]));
    const w = mount(AskPanel, { global: { stubs } });
    const toggle = w.get('[data-testid="ask-voice"]');
    expect(toggle.attributes("aria-pressed")).toBe("false");
    expect(toggle.attributes("aria-label")).toBe("Ooru reads replies aloud · about 6 credits per minute of speech, charged only while it reads");
    await ask(w);
    expect(voiceTransport).not.toHaveBeenCalled();
    w.unmount();
  });

  // Bug caught: the switch doing nothing, or reading aloud something other than the reply (chips, quote cards).
  it("reads only the reply aloud once the switch is pressed", async () => {
    useAskUiStore().openPanel();
    transport.mockResolvedValueOnce(sse([{ type: "session", sessionId: "s1" }, { type: "text", delta: "Harl runs it." }, { type: "propose", proposal }, done]));
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-voice"]').trigger("click");
    expect(w.get('[data-testid="ask-voice"]').attributes("aria-pressed")).toBe("true");
    await ask(w);
    expect(voiceTransport).toHaveBeenCalledTimes(1);
    expect(voiceTransport).toHaveBeenCalledWith({ campaignId: "c1", sessionId: "s1", role: "familiar", speakerId: null, speakerName: "Ooru", text: "Harl runs it.", how: null, key: null });
    w.unmount();
  });

  // Bug caught (seen live): no way to hear a reply again once Ooru had read it; and the speaker only there with
  // read-aloud on, where a press is asking for that one reply whatever the switch says.
  it("offers a speaker under a finished reply, with read-aloud off too, and a press reads that reply", async () => {
    useAskUiStore().openPanel();
    transport.mockResolvedValueOnce(sse([{ type: "session", sessionId: "s1" }, { type: "text", delta: "Harl runs it." }, done]));
    const w = mount(AskPanel, { global: { stubs } });
    await ask(w);
    expect(w.get('[data-testid="ask-voice"]').attributes("aria-pressed")).toBe("false");
    voiceTransport.mockClear();
    await w.get('[data-testid="ask-reply-replay"]').trigger("click");
    await flushPromises();
    expect(voiceTransport).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s1", role: "familiar", text: "Harl runs it." }));
    w.unmount();
  });

  // Bug caught: a speaker offered where the server has no voices, which could only fail.
  it("offers no speaker under replies where voices are off", async () => {
    useAskUiStore().openPanel();
    rates.value = { on: false, perMinute: { elevenlabs: 6, inworld: null } };
    transport.mockResolvedValueOnce(sse([{ type: "session", sessionId: "s1" }, { type: "text", delta: "Harl runs it." }, done]));
    const w = mount(AskPanel, { global: { stubs } });
    await ask(w);
    expect(w.find('[data-testid="ask-reply-replay"]').exists()).toBe(false);
    w.unmount();
  });

  // Bug caught: a switch offered where the server has no voices, which would only ever fail.
  it("hides the switch when voices are off or ElevenLabs has no rate", async () => {
    useAskUiStore().openPanel();
    rates.value = { on: false, perMinute: { elevenlabs: 6, inworld: null } };
    const off = mount(AskPanel, { global: { stubs } });
    expect(off.find('[data-testid="ask-voice"]').exists()).toBe(false);
    off.unmount();
    rates.value = { on: true, perMinute: { elevenlabs: null, inworld: 3 } };
    const norate = mount(AskPanel, { global: { stubs } });
    expect(norate.find('[data-testid="ask-voice"]').exists()).toBe(false);
    norate.unmount();
  });

  // Bug caught: the price lookup failing after the DM turned Ooru on, which hid the switch while Ooru kept speaking
  // (and charging) with no control left to mute it.
  it("reads nothing aloud once its switch has gone from the screen", async () => {
    useAskUiStore().openPanel();
    transport.mockResolvedValueOnce(sse([{ type: "session", sessionId: "s1" }, { type: "text", delta: "Harl runs it." }, done]));
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-voice"]').trigger("click");
    rates.value = undefined;
    await nextTick();
    expect(w.find('[data-testid="ask-voice"]').exists()).toBe(false);
    await ask(w);
    expect(voiceTransport).not.toHaveBeenCalled();
    w.unmount();
  });

  // Bug caught: a path into a new turn (a chip chosen, a question carried over) that forgot to silence the old
  // answer, so the old reply kept playing over the new one.
  it("silences the answer still being read when a new turn starts", async () => {
    useAskUiStore().openPanel();
    voicePlayer = (src: string) => ({ done: new Promise<void>(() => {}), stop: () => void stoppedClips.push(src) });
    transport.mockResolvedValueOnce(sse([{ type: "session", sessionId: "s1" }, { type: "text", delta: "Harl runs it." }, done]));
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-voice"]').trigger("click");
    await ask(w);
    await flushPromises();
    expect(stoppedClips).toEqual([]);
    transport.mockResolvedValueOnce(sse([{ type: "text", delta: "And Mirel keeps the books." }, done]));
    await ask(w);
    expect(stoppedClips).toEqual(["data:audio/mpeg;base64,AAAA"]);
    w.unmount();
  });

  // Bug caught: Ooru silently going quiet when credits run out, leaving the DM to think the switch broke.
  it("says why Ooru went quiet when credits run out", async () => {
    useAskUiStore().openPanel();
    voiceTransport.mockResolvedValueOnce(new Response(JSON.stringify({ error: "insufficient_credits" }), { status: 402 }));
    transport.mockResolvedValueOnce(sse([{ type: "session", sessionId: "s1" }, { type: "text", delta: "Harl runs it." }, done]));
    const w = mount(AskPanel, { global: { stubs } });
    await w.get('[data-testid="ask-voice"]').trigger("click");
    await ask(w);
    expect(w.get('[data-testid="ask-voice-note"]').text()).toContain("out of credits");
    // Bug caught: the owl frozen for good once Ooru went quiet; it goes back to moving with the words arriving.
    transport.mockResolvedValueOnce(sse([{ type: "text", delta: "And Mirel keeps the books." }, done]));
    await ask(w);
    expect(w.getComponent(FamiliarAvatar).props("speaking")).toBe(true);
    w.unmount();
  });
});
