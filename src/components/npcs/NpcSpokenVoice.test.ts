import { describe, expect, it, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import NpcSpokenVoice from "./NpcSpokenVoice.vue";
import type { SpeechVoice } from "@/types/speechVoice.types";

const h = vi.hoisted(() => ({ voices: null as unknown, mutateAsync: vi.fn(), toggle: vi.fn(), toastError: vi.fn(), aiOn: true, readEnabled: [] as boolean[] }));

vi.mock("@/composables/voices/useSpeechVoices", async () => {
  const { toValue } = await import("vue");
  return {
    useSpeechVoices: (enabled: () => boolean) => (h.readEnabled.push(toValue(enabled)), { data: h.voices }),
    useVoiceSample: () => ({ toggle: h.toggle, stop: vi.fn(), playing: ref(null), loading: ref(null), problem: ref(null) }),
  };
});
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: h.aiOn }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useUpdateNpc: () => ({ mutateAsync: h.mutateAsync, isPending: ref(false) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: h.toastError, fromError: (e: unknown) => (e as Error).message }) }));

function slot(over: Partial<SpeechVoice>): SpeechVoice {
  return {
    id: "s1", name: "Maren", description: "A warm older woman", design_prompt: null, preview_text: null, sex: "woman", age: "old",
    kind: "cast", origin: "stock", service: "elevenlabs", voice_id: "v1", library_voice_id: null, sample_key: null, binding: null, active: true, created_at: "", updated_at: "", ...over,
  };
}

function mountVoice(speech_voice_id: string | null) {
  return mount(NpcSpokenVoice, {
    props: { npc: { id: "npc-1", speech_voice_id } },
    // The modal renders inline: the browser's own rows are what is under test.
    global: { stubs: { Teleport: true, AppModal: { props: ["open"], template: "<div v-if='open'><slot /></div>" } }, directives: { "no-pwm": {} } },
  });
}

const buttonByLabel = (w: ReturnType<typeof mountVoice>, label: string) => w.findAll("button").find((b) => b.text().includes(label));

beforeEach(() => {
  h.mutateAsync.mockReset().mockResolvedValue({});
  h.toggle.mockReset();
  h.toastError.mockReset();
  h.aiOn = true;
  h.readEnabled = [];
  h.voices = ref([slot({}), slot({ id: "s2", name: "Bram", sex: "man", age: "adult" }), slot({ id: "s3", name: "Planned", voice_id: null, service: null }), slot({ id: "s4", name: "Retired", active: false })]);
});

describe("NpcSpokenVoice", () => {
  // Bug caught: a voice picker on a campaign without AI, where no voice is ever heard, reading the registry for nothing.
  it("shows nothing and reads no voices where the campaign has AI off", () => {
    h.aiOn = false;
    const w = mountVoice("s1");
    expect(w.find("[data-testid=npc-spoken-voice]").exists()).toBe(false);
    expect(h.readEnabled).toEqual([false]);
  });

  it("names the cast voice and listens to that slot", async () => {
    const w = mountVoice("s1");
    expect(w.get("[data-testid=voice-name]").text()).toBe("Maren");
    await buttonByLabel(w, "Listen")!.trigger("click");
    expect(h.toggle).toHaveBeenCalledWith("s1");
  });

  it("shows a retired slot as cast at the table, with nothing to listen to", () => {
    const w = mountVoice("s4");
    expect(w.get("[data-testid=voice-name]").text()).toBe("Cast at the table");
    expect(buttonByLabel(w, "Listen")).toBeUndefined();
  });

  // Bug caught: planned or retired slots offered, where a pick could never speak.
  it("offers only filled, active voices in the browser", async () => {
    const w = mountVoice(null);
    await buttonByLabel(w, "Change")!.trigger("click");
    const rows = w.findAll("[data-testid^=npc-voice-s]").map((r) => r.text());
    expect(rows.some((n) => n.includes("Maren"))).toBe(true);
    expect(rows.some((n) => n.includes("Bram"))).toBe(true);
    expect(rows.some((n) => n.includes("Planned") || n.includes("Retired"))).toBe(false);
  });

  // Bug caught (seen live): a voice could only be heard once it was chosen, and a pick wrote the wrong slot.
  it("lets each voice be heard before it is chosen, and Use this voice writes that slot", async () => {
    const w = mountVoice(null);
    await buttonByLabel(w, "Change")!.trigger("click");
    const bram = w.get("[data-testid=npc-voice-s2]");
    await bram.findAll("button").find((b) => b.text().includes("Listen"))!.trigger("click");
    expect(h.toggle).toHaveBeenCalledWith("s2");
    expect(h.mutateAsync).not.toHaveBeenCalled();
    await bram.findAll("button").find((b) => b.text().includes("Use this voice"))!.trigger("click");
    expect(h.mutateAsync).toHaveBeenCalledWith({ id: "npc-1", update: { speech_voice_id: "s2" } });
  });

  // Bug caught (seen live): a voice described as "man, old" only, with nothing of its accent or character.
  it("shows each voice's description in the browser, and finds voices by it", async () => {
    h.voices = ref([slot({ description: "A haughty noble, British" }), slot({ id: "s2", name: "Bram", sex: "man", age: "adult", description: "A gruff sailor" })]);
    const w = mountVoice(null);
    await buttonByLabel(w, "Change")!.trigger("click");
    expect(w.get("[data-testid=npc-voice-s1]").text()).toContain("A haughty noble, British");
    await w.get("[data-testid=npc-voice-browser] input").setValue("british");
    expect(w.find("[data-testid=npc-voice-s2]").exists()).toBe(false);
    expect(w.find("[data-testid=npc-voice-s1]").exists()).toBe(true);
  });

  it("'Let the table cast' writes null", async () => {
    const w = mountVoice("s1");
    await buttonByLabel(w, "Change")!.trigger("click");
    await buttonByLabel(w, "Let the table cast")!.trigger("click");
    expect(h.mutateAsync).toHaveBeenCalledWith({ id: "npc-1", update: { speech_voice_id: null } });
  });

  it("a refused write shows the server's sentence and keeps the picker open", async () => {
    h.mutateAsync.mockRejectedValue(new Error("That voice cannot be given to a character."));
    const w = mountVoice("s1");
    await buttonByLabel(w, "Change")!.trigger("click");
    await buttonByLabel(w, "Let the table cast")!.trigger("click");
    await flushPromises();
    expect(h.toastError).toHaveBeenCalledWith("That voice cannot be given to a character.");
    expect(w.find("[data-testid=npc-voice-browser]").exists()).toBe(true);
  });
});
