import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { voiceStudioCall } from "./useSpeechVoices";

const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe("voiceStudioCall", () => {
  // Bug caught: the studio's own sentence lost behind a generic one, so the admin never learns why (a missing key,
  // a preview text too short).
  it("shows the studio's own refusal", async () => {
    await expect(voiceStudioCall({ action: "account" }, answer(503, { error: "no_key", message: "ElevenLabs is not set up on this server." })))
      .rejects.toThrow("ElevenLabs is not set up on this server.");
  });

  // Bug caught: a gateway's message ("name resolution failed") shown to a person as if it were the studio's answer.
  it("never shows a message that is not the studio's", async () => {
    await expect(voiceStudioCall({ action: "account" }, answer(502, { message: "name resolution failed" })))
      .rejects.toThrow("The voice studio could not be reached. Try again in a moment.");
  });
});

describe("useAudioToggle", () => {
  class FakeAudio {
    static made: FakeAudio[] = [];
    paused = false;
    constructor(public src: string) {
      FakeAudio.made.push(this);
    }
    addEventListener(): void {}
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): void {
      this.paused = true;
    }
  }

  async function setup() {
    FakeAudio.made = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:${FakeAudio.made.length}`, revokeObjectURL: () => undefined });
    const resolve = vi.fn(async () => ({ audio: "QUJD", mediaType: "audio/mpeg" }));
    const { useAudioToggle } = await import("./useSpeechVoices");
    const { mount } = await import("@vue/test-utils");
    let player!: ReturnType<typeof useAudioToggle>;
    mount({ template: "<div />", setup: () => void (player = useAudioToggle(resolve)) });
    return { player, resolve };
  }

  // Bug caught: a second press on the playing voice starting it again instead of stopping it.
  it("stops on a second press of the same key", async () => {
    const { player } = await setup();
    await player.toggle("a");
    expect(player.playing.value).toBe("a");
    await player.toggle("a");
    expect(player.playing.value).toBeNull();
    expect(FakeAudio.made[0].paused).toBe(true);
  });

  // Bug caught: two voices playing over each other when the admin presses a second one.
  it("plays one key at a time, and fetches each key's audio once", async () => {
    const { player, resolve } = await setup();
    await player.toggle("a");
    await player.toggle("b");
    expect(player.playing.value).toBe("b");
    expect(FakeAudio.made[0].paused).toBe(true);
    await player.toggle("a");
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  // Bug caught: Listen on one voice, then on another before the first had loaded, and both playing over each other.
  it("does not play a slow first fetch after another key was pressed", async () => {
    FakeAudio.made = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:${FakeAudio.made.length}`, revokeObjectURL: () => undefined });
    let slow!: (a: { audio: string; mediaType: string }) => void;
    const resolve = vi.fn((key: string) =>
      key === "a" ? new Promise<{ audio: string; mediaType: string }>((r) => (slow = r)) : Promise.resolve({ audio: "QUJD", mediaType: "audio/mpeg" }),
    );
    const { useAudioToggle } = await import("./useSpeechVoices");
    const { mount } = await import("@vue/test-utils");
    let player!: ReturnType<typeof useAudioToggle>;
    mount({ template: "<div />", setup: () => void (player = useAudioToggle(resolve)) });
    const first = player.toggle("a");
    await player.toggle("b");
    slow({ audio: "QUJD", mediaType: "audio/mpeg" });
    await first;
    expect(player.playing.value).toBe("b");
    expect(FakeAudio.made).toHaveLength(1);
  });
});
