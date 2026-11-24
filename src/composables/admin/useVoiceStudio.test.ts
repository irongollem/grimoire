import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent } from "vue";
import type { SpeechVoice, VoiceStudioRequest } from "@/types/speechVoice.types";

const { fake, studio } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake(), studio: { requests: [] as unknown[], answer: (_r: unknown): unknown => ({}) } };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/composables/voices/useSpeechVoices", () => ({
  SPEECH_VOICES_KEY: ["speech-voices"],
  voiceStudioCall: async (request: unknown) => {
    studio.requests.push(request);
    return studio.answer(request);
  },
}));

import { ageOfLabel, canDeleteFromService, designProblem, nextSlotName, sexOfLabel, shouldRetireOld, useVoiceStudio } from "./useVoiceStudio";

function slot(overrides: Partial<SpeechVoice> = {}): SpeechVoice {
  return {
    id: "slot-1",
    name: "Shady guy",
    description: "A fence",
    design_prompt: "hushed",
    preview_text: "x".repeat(120),
    sex: "man",
    age: "adult",
    kind: "cast",
    origin: "designed",
    service: "elevenlabs",
    voice_id: "voice-abcdefgh",
    library_voice_id: null,
    sample_key: null,
    binding: null,
    active: true,
    created_at: "2026-11-24T00:00:00Z",
    updated_at: "2026-11-24T00:00:00Z",
    ...overrides,
  };
}

function run<T>(setup: () => T): { result: T; qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: T;
  const app = createApp(
    defineComponent({
      setup() {
        result = setup();
        return () => null;
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return { result, qc };
}

/** What the studio was asked, minus the account read the composable makes on mount. */
const sent = () => studio.requests.filter((r) => (r as { action: string }).action !== "account");

const preview = { id: "draft-1", audio: "QUJD", mediaType: "audio/mpeg" };

beforeEach(() => {
  fake.reset();
  studio.requests.length = 0;
  studio.answer = (r) => {
    const request = r as VoiceStudioRequest;
    if (request.action === "account") return { slots: { used: 1, limit: 30 }, unregistered: [] };
    if (request.action === "keep") return { voice: slot({ id: request.slotId ?? "new-slot" }) };
    return { ok: true };
  };
});

describe("shouldRetireOld", () => {
  // Deleting a voice the studio did not make would take an imported or library voice off the account.
  it.each([
    ["designed", true, true],
    ["designed", false, false],
    ["imported", true, false],
    ["library", true, false],
    ["stock", true, false],
  ] as const)("a %s voice with the box ticked=%s retires: %s", (origin, asked, expected) => {
    expect(shouldRetireOld({ origin, voice_id: "voice-abcdefgh" }, asked)).toBe(expected);
  });

  it("an empty slot has no old voice to retire even when asked", () => {
    expect(shouldRetireOld({ origin: "designed", voice_id: null }, true)).toBe(false);
  });
});

describe("canDeleteFromService", () => {
  it("never offers to delete a stock voice from the service, since it belongs to the service", () => {
    expect(canDeleteFromService({ origin: "stock", voice_id: "voice-abcdefgh" })).toBe(false);
    expect(canDeleteFromService({ origin: "library", voice_id: "voice-abcdefgh" })).toBe(true);
  });
});

describe("nextSlotName", () => {
  it("numbers a copy: a name gets 2, a numbered name goes up, not '2 2'", () => {
    expect(nextSlotName("Shady guy")).toBe("Shady guy 2");
    expect(nextSlotName("Shady guy 2")).toBe("Shady guy 3");
  });
});

describe("designProblem", () => {
  const text = (n: number) => "x".repeat(n);
  it("holds ElevenLabs to 100 to 1000 characters on both edges, which the service would refuse", () => {
    expect(designProblem("elevenlabs", "hushed", text(99))).not.toBeNull();
    expect(designProblem("elevenlabs", "hushed", text(100))).toBeNull();
    expect(designProblem("elevenlabs", "hushed", text(1000))).toBeNull();
    expect(designProblem("elevenlabs", "hushed", text(1001))).not.toBeNull();
  });
  it("does not hold Inworld to the ElevenLabs minimum, but still needs words and a prompt", () => {
    expect(designProblem("inworld", "hushed", text(20))).toBeNull();
    expect(designProblem("inworld", "  ", text(20))).not.toBeNull();
    expect(designProblem("inworld", "hushed", "  ")).not.toBeNull();
  });
});

describe("useVoiceStudio keep", () => {
  it("retires the old voice only when asked and only when the studio designed it", async () => {
    const { result } = run(() => useVoiceStudio());
    await result.keep.mutateAsync({ service: "elevenlabs", preview, slot: slot({ origin: "designed" }), retireOld: true });
    await result.keep.mutateAsync({ service: "elevenlabs", preview, slot: slot({ origin: "imported" }), retireOld: true });
    await result.keep.mutateAsync({ service: "elevenlabs", preview, slot: slot({ origin: "designed" }) });
    const keeps = sent() as { retireOld: boolean }[];
    expect(keeps.map((k) => k.retireOld)).toEqual([true, false, false]);
  });

  it("forgets the replaced slot's cached sample, so Listen does not play the old voice", async () => {
    const forget = vi.fn();
    const { result } = run(() => useVoiceStudio({ forget }));
    await result.keep.mutateAsync({ service: "elevenlabs", preview, slot: slot({ id: "slot-9" }) });
    expect(forget).toHaveBeenCalledWith("slot-9");
  });

  it("keeping as a new slot sends the copied fields under the new name and fills no existing slot", async () => {
    const forget = vi.fn();
    const { result } = run(() => useVoiceStudio({ forget }));
    const original = slot();
    await result.keep.mutateAsync({
      service: "inworld",
      preview,
      newSlot: { name: "Shady guy 2", description: original.description, design_prompt: original.design_prompt, preview_text: original.preview_text, sex: "man", age: "adult", kind: "cast" },
    });
    const keepSent = sent().find((r) => (r as { action: string }).action === "keep") as Record<string, unknown>;
    expect(keepSent.slotId).toBeUndefined();
    expect(keepSent.slot).toMatchObject({ name: "Shady guy 2", description: "A fence", sex: "man", kind: "cast" });
    expect(forget).not.toHaveBeenCalled();
  });

  it("refreshes the registry after a keep so the new voice shows in its slot", async () => {
    const { result, qc } = run(() => useVoiceStudio());
    qc.setQueryData(["speech-voices"], []);
    await result.keep.mutateAsync({ service: "elevenlabs", preview, slot: slot() });
    expect(qc.getQueryState(["speech-voices"])?.isInvalidated).toBe(true);
  });
});

describe("useVoiceStudio slot writes", () => {
  it("stores a blank prompt as null, never as an empty string, so the designer is not sent nothing", async () => {
    const { result } = run(() => useVoiceStudio());
    await result.saveSlot.mutateAsync({ fields: { name: "  Booming villain ", description: "", design_prompt: "   ", preview_text: null, sex: null, age: null, kind: "cast" } });
    expect(fake.rows("speech_voices")).toMatchObject([{ name: "Booming villain", design_prompt: null, origin: "designed" }]);
  });

  it("imports an account voice as origin imported, bound to its service and voice id", async () => {
    const { result } = run(() => useVoiceStudio());
    await result.importVoice.mutateAsync({
      voice: { service: "elevenlabs", voiceId: "voice-abcdefgh" },
      slot: { name: "Old gaffer", description: "", design_prompt: null, preview_text: null, sex: null, age: null, kind: "own" },
    });
    expect(fake.rows("speech_voices")).toMatchObject([{ origin: "imported", service: "elevenlabs", voice_id: "voice-abcdefgh", kind: "own" }]);
  });

  it("removing a planned slot deletes only its row and never calls the service", async () => {
    fake.seed("speech_voices", [{ ...slot({ id: "plan", voice_id: null, service: null }) }]);
    const { result } = run(() => useVoiceStudio());
    await result.remove.mutateAsync({ slot: slot({ id: "plan", voice_id: null, service: null }), fromService: true });
    expect(fake.rows("speech_voices")).toEqual([]);
    expect(sent()).toEqual([]);
  });

  it("never asks the service to delete a stock voice, even when the box was ticked", async () => {
    const { result } = run(() => useVoiceStudio());
    await result.remove.mutateAsync({ slot: slot({ origin: "stock" }), fromService: true });
    expect(sent()).toEqual([{ action: "remove", slotId: "slot-1", fromService: false }]);
  });
});

describe("a looked-up voice's labels", () => {
  // Bug caught: ElevenLabs' "middle_aged" falling through to no age, or a gender label it does not use guessed into a
  // sex, so the prefilled form casts the voice for the wrong characters.
  it("maps ElevenLabs' gender and age labels, and leaves anything else unset", () => {
    expect([sexOfLabel("female"), sexOfLabel("male"), sexOfLabel("neutral"), sexOfLabel(null)]).toEqual(["woman", "man", null, null]);
    expect([ageOfLabel("young"), ageOfLabel("middle_aged"), ageOfLabel("old"), ageOfLabel("child"), ageOfLabel(null)]).toEqual(["young", "adult", "old", null, null]);
  });
});

