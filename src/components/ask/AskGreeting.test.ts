// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { VoiceStudioRequest } from "@/types/speechVoice.types";

const sent: VoiceStudioRequest[] = [];
let greetingAnswer: () => Promise<unknown>;
const play = vi.fn(async () => undefined);

vi.mock("@/composables/voices/useSpeechVoices", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/composables/voices/useSpeechVoices")>();
  // The studio's seam: record every request, answer greeting from the test and the sample with a tiny recording.
  const transport = async (request: VoiceStudioRequest): Promise<Response> => {
    sent.push(request);
    if (request.action === "greeting") {
      try {
        return new Response(JSON.stringify(await greetingAnswer()), { status: 200 });
      } catch {
        return new Response("{}", { status: 502 });
      }
    }
    return new Response(JSON.stringify({ audio: "QUJD", mediaType: "audio/mpeg" }), { status: 200 });
  };
  return { ...real, useFamiliarGreeting: () => real.useFamiliarGreeting(transport), useFamiliarSample: () => real.useFamiliarSample(transport) };
});

import AskGreeting from "./AskGreeting.vue";

const FALLBACK = "Ask what your campaign already says, ask for ideas, or ask for something to be made.";

async function mountGreeting() {
  const w = mount(AskGreeting, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
  await flushPromises();
  return w;
}

beforeEach(() => {
  sent.length = 0;
  play.mockClear();
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("Audio", class { addEventListener() {} pause() {} play = play; });
});

describe("AskGreeting", () => {
  // Bug caught: the Familiar opening on the generic line, so a new DM never learns what Ooru is or sounds like.
  it("opens with Ooru's greeting, not the generic line", async () => {
    greetingAnswer = async () => ({ text: "Hoo. I am Ooru.", canSpeak: true });
    const w = await mountGreeting();
    expect(w.get('[data-testid="ask-reply-text"]').text()).toBe("Hoo. I am Ooru.");
    expect(w.find('[data-testid="ask-greeting-fallback"]').exists()).toBe(false);
  });

  // Bug caught: Hear Ooru asking for a slot or no binding, so it plays another voice or nothing; or playing at once.
  it("asks for the familiar binding's sample only when Hear Ooru is pressed, never on its own", async () => {
    greetingAnswer = async () => ({ text: "Hoo.", canSpeak: true });
    const w = await mountGreeting();
    expect(sent.map((r) => r.action)).toEqual(["greeting"]);
    expect(play).not.toHaveBeenCalled();
    await w.get('[data-testid="ask-greeting-hear"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ action: "sample", binding: "familiar" });
    expect(play).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a Hear button that the server's own canSpeak=false (no recording yet) would answer with an error.
  it("offers no Hear Ooru when the voice cannot speak it", async () => {
    greetingAnswer = async () => ({ text: "Hoo.", canSpeak: false });
    const w = await mountGreeting();
    expect(w.find('[data-testid="ask-greeting-hear"]').exists()).toBe(false);
    expect(w.text()).toContain("Hoo.");
  });

  // Bug caught: a failed greeting call leaving the empty Familiar blank (or throwing), instead of today's line.
  it("falls back to the old empty line when the greeting fails", async () => {
    greetingAnswer = async () => {
      throw new Error("down");
    };
    const w = await mountGreeting();
    expect(w.get('[data-testid="ask-greeting-fallback"]').text()).toBe(FALLBACK);
    expect(w.find('[data-testid="ask-greeting-hear"]').exists()).toBe(false);
  });

  it("falls back to the old empty line when no greeting is set", async () => {
    greetingAnswer = async () => ({ text: null, canSpeak: false });
    const w = await mountGreeting();
    expect(w.get('[data-testid="ask-greeting-fallback"]').text()).toBe(FALLBACK);
  });
});
