import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicePlayer } from "./useClipQueue";

const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { stopVoiceLines, useVoiceLineSpeech } = await import("./useVoiceLineSpeech");

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const clip = () => new Response(JSON.stringify({ audio: "QUJD", mime: "audio/mpeg" }), { status: 200 });
const LINES = [
  { text: "The gate shuts at dusk.", key: "k-1" },
  { text: "Move along.", key: "k-2" },
  { text: "I never saw you.", key: null },
];

function setup(answer: () => Response = clip) {
  const transport = vi.fn(async (_request: unknown) => answer());
  const stops: string[] = [];
  const finish: Array<() => void> = [];
  const player: VoicePlayer = (src) => {
    let end: () => void = () => {};
    const done = new Promise<void>((resolve) => (end = resolve));
    finish.push(end);
    return { done, stop: () => { stops.push(src); end(); } };
  };
  const speech = useVoiceLineSpeech({ campaignId: "camp-1", speaker: { id: "npc-1", name: "Johnny Reed" }, lines: LINES, transport, player });
  return { speech, transport, stops, finish };
}

describe("useVoiceLineSpeech", () => {
  beforeEach(() => { auth.user = { id: "u1" }; });

  // Bug caught: the line spoken in another's voice or under another's proof: a wrong key, edited words, or a session id
  // that does not exist outside a sitting would be refused or bill the wrong line.
  it("asks table-voice for the line's own key and exact words, in the NPC's voice, outside any sitting", async () => {
    const { speech, transport } = setup();
    await speech.toggle(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toEqual({
      campaignId: "camp-1", sessionId: null, role: "character", speakerId: "npc-1", speakerName: "Johnny Reed", text: "Move along.", how: null, key: "k-2",
    });
  });

  // Bug caught: a line with no key still offering Speak aloud (a button that can only fail) or asking the server anyway.
  it("offers no Speak aloud on a line without a key, and asks nothing when it is pressed", async () => {
    const { speech, transport } = setup();
    expect(speech.canSpeak(2)).toBe(false);
    expect(speech.canSpeak(0)).toBe(true);
    await speech.toggle(2);
    expect(transport).not.toHaveBeenCalled();
  });

  // Bug caught: a second press starting the clip over instead of stopping it, so a DM could not cut a line short.
  it("stops the line when it is pressed again while playing", async () => {
    const { speech, stops } = setup();
    void speech.toggle(0);
    await tick();
    expect(speech.phaseOf(0)).toBe("playing");
    await speech.toggle(0);
    expect(stops).toEqual(["data:audio/mpeg;base64,QUJD"]);
    expect(speech.phaseOf(0)).toBe("idle");
  });

  // Bug caught: every replay asking the server again, charging a credit for a clip the DM already paid for.
  it("replays a clip already fetched without asking the server again", async () => {
    const { speech, transport, finish } = setup();
    void speech.toggle(0);
    await tick();
    finish[0]();
    await tick();
    expect(speech.phaseOf(0)).toBe("idle");
    expect(speech.isFetched(0)).toBe(true);
    void speech.toggle(0);
    await tick();
    expect(speech.phaseOf(0)).toBe("playing");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // Bug caught: two lines talking over each other when a second is pressed while the first plays.
  it("plays one line at a time: pressing another stops the first", async () => {
    const { speech, stops } = setup();
    void speech.toggle(0);
    await tick();
    void speech.toggle(1);
    await tick();
    expect(stops).toHaveLength(1);
    expect(speech.phaseOf(0)).toBe("idle");
    expect(speech.phaseOf(1)).toBe("playing");
  });

  // Bug caught: a stopped line's clip arriving late and playing anyway, after the DM pressed to cut it.
  it("never plays a clip that arrives after its line was stopped", async () => {
    let release: (r: Response) => void = () => {};
    const transport = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    const played: string[] = [];
    const speech = useVoiceLineSpeech({ campaignId: "c", speaker: { id: "n", name: "N" }, lines: LINES, transport, player: (src) => (played.push(src), { done: Promise.resolve(), stop: () => {} }) });
    void speech.toggle(0);
    await tick();
    expect(speech.phaseOf(0)).toBe("loading");
    await speech.toggle(0);
    release(clip());
    await tick();
    expect(played).toEqual([]);
    expect(speech.phaseOf(0)).toBe("idle");
  });

  // Bug caught: out of credits met with a button that keeps asking (and failing), or no word on why it went quiet.
  it("says it is out of credits on an insufficient_credits 402 and stops offering the button", async () => {
    const { speech, transport } = setup(() => new Response(JSON.stringify({ error: "insufficient_credits" }), { status: 402 }));
    await speech.toggle(0);
    expect(speech.refusal.value).toBe("The voice went quiet: you are out of credits.");
    expect(speech.canSpeak(1)).toBe(false);
    await speech.toggle(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(speech.phaseOf(0)).toBe("idle");
  });

  // Bug caught: voices switched off at the server showing as a silent failure.
  it("says voices are not switched on after a 503", async () => {
    const { speech } = setup(() => new Response("", { status: 503 }));
    await speech.toggle(0);
    expect(speech.refusal.value).toBe("The voice cannot speak: voices are not switched on.");
  });

  // Bug caught: a line still playing after its card was regenerated or a new question was asked, or two cards' lines
  // playing over each other.
  it("plays one voice line app-wide: another card's line, or stopVoiceLines, silences it", async () => {
    const first = setup();
    void first.speech.toggle(0);
    await tick();
    expect(first.speech.phaseOf(0)).toBe("playing");
    const second = setup();
    void second.speech.toggle(1);
    await tick();
    expect(first.stops).toEqual(["data:audio/mpeg;base64,QUJD"]);
    expect(first.speech.phaseOf(0)).toBe("idle");
    stopVoiceLines();
    expect(second.speech.phaseOf(1)).toBe("idle");
    expect(second.stops).toHaveLength(1);
  });
});
