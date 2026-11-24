import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";
import type { VoiceRequest } from "@/composables/table/useTableVoice";
import type { VoicePlayer } from "@/composables/voices/useClipQueue";
import { useFamiliarVoice } from "./useFamiliarVoice";

const ok = (audio = "AAAA") => new Response(JSON.stringify({ audio, mime: "audio/mpeg" }), { status: 200 });
const tick = () => new Promise((r) => setTimeout(r, 0));

function manualPlayer() {
  const played: string[] = [];
  const stopped: string[] = [];
  const finish: Array<() => void> = [];
  const player: VoicePlayer = (src) => {
    played.push(src);
    let end!: () => void;
    const done = new Promise<void>((resolve) => { end = resolve; });
    finish.push(end);
    return { done, stop: () => { stopped.push(src); end(); } };
  };
  return { player, played, stopped, finish };
}

let accounts = 0;
beforeEach(() => {
  safeLocalStorage().clear();
  setActivePinia(createPinia());
  useAuthStore().user = { id: `u${++accounts}` } as User;
});

const input = (...texts: string[]) => ({ campaignId: "c1", sessionId: "s1", texts });

describe("useFamiliarVoice", () => {
  // Bug caught: Oolu talking (and spending credits) before anyone switched it on.
  it("is off by default and asks for nothing while off", async () => {
    const sent: VoiceRequest[] = [];
    const p = manualPlayer();
    const voice = useFamiliarVoice({ transport: async (r) => { sent.push(r); return ok(); }, player: p.player });
    expect(voice.on.value).toBe(false);
    voice.say(input("Hello."));
    await tick();
    expect(sent).toEqual([]);
    expect(p.played).toEqual([]);
  });

  // Bug caught: the request carrying a key or a role the server does not prove, so every reply was refused as unprovable.
  it("asks for each reply with the Familiar's role, name, no key and the text unchanged", async () => {
    const sent: VoiceRequest[] = [];
    const voice = useFamiliarVoice({ transport: async (r) => { sent.push(r); return ok(); }, player: manualPlayer().player });
    voice.setOn(true);
    voice.say(input("Hello.  "));
    await tick();
    // A null key is left off the wire by the shared transport (`sendToTableVoice`).
    expect(sent).toEqual([{ campaignId: "c1", sessionId: "s1", role: "familiar", speakerId: null, speakerName: "Oolu", text: "Hello.  ", how: null, key: null }]);
  });

  // Bug caught: the second paragraph playing first because its clip came back sooner.
  it("plays the replies in order whichever clip is made first", async () => {
    const p = manualPlayer();
    const voice = useFamiliarVoice({
      transport: (r) => (r.text === "First." ? new Promise((res) => setTimeout(() => res(ok("ONE")), 10)) : Promise.resolve(ok("TWO"))),
      player: p.player,
    });
    voice.setOn(true);
    voice.say(input("First.", "Second."));
    await new Promise((r) => setTimeout(r, 30));
    expect(p.played).toEqual(["data:audio/mpeg;base64,ONE"]);
    p.finish[0]!();
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,ONE", "data:audio/mpeg;base64,TWO"]);
  });

  // Bug caught: a second turn's reply asked for while the first clip was still being made started a loop of its own,
  // and the two answers played over each other.
  it("never plays two replies at once when a second turn arrives while the first is being made", async () => {
    const p = manualPlayer();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const voice = useFamiliarVoice({ transport: async (r) => { if (r.text === "First.") await gate; return ok(r.text === "First." ? "ONE" : "TWO"); }, player: p.player });
    voice.setOn(true);
    voice.say(input("First."));
    voice.say(input("Second."));
    release();
    await tick();
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,ONE"]);
    p.finish[0]!();
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,ONE", "data:audio/mpeg;base64,TWO"]);
  });

  // Bug caught: the owl still moving after the clip ended, or never moving with the audio.
  it("is speaking exactly while a clip plays", async () => {
    const p = manualPlayer();
    const voice = useFamiliarVoice({ transport: async () => ok(), player: p.player });
    voice.setOn(true);
    voice.say(input("Hi."));
    await tick();
    expect(voice.speaking.value).toBe(true);
    p.finish[0]!();
    await tick();
    expect(voice.speaking.value).toBe(false);
  });

  // Bug caught: switching it off leaving the current reply talking, or the waiting ones starting afterwards.
  it("switching off cuts the clip and drops the waiting ones", async () => {
    const p = manualPlayer();
    const voice = useFamiliarVoice({ transport: async () => ok(), player: p.player });
    voice.setOn(true);
    voice.say(input("One.", "Two."));
    await tick();
    voice.setOn(false);
    await tick();
    expect(p.stopped).toHaveLength(1);
    expect(p.played).toHaveLength(1);
    expect(voice.speaking.value).toBe(false);
  });

  // Bug caught: a new question not silencing the old answer, or a clip still being fetched starting after stop.
  it("stop drops a clip that was still being made", async () => {
    const p = manualPlayer();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const voice = useFamiliarVoice({ transport: async () => { await gate; return ok(); }, player: p.player });
    voice.setOn(true);
    voice.say(input("Slow."));
    voice.stop();
    release();
    await tick();
    expect(p.played).toEqual([]);
  });

  // Bug caught: asking again for every reply after the server said voices are off, or the owner never told why.
  it("remembers a 503 and asks no more until switched on again", async () => {
    let calls = 0;
    const voice = useFamiliarVoice({ transport: async () => { calls += 1; return new Response("{}", { status: 503 }); }, player: manualPlayer().player });
    voice.setOn(true);
    voice.say(input("A."));
    await tick();
    expect(voice.unavailable.value).toBe(true);
    voice.say(input("B."));
    await tick();
    expect(calls).toBe(1);
    voice.setOn(true);
    expect(voice.unavailable.value).toBe(false);
  });

  // Bug caught: out-of-credits and allowance-spent told apart wrongly, so the DM is sent to buy credits for a service limit.
  it("tells the DM's credits running out from the service allowance being spent", async () => {
    const refuse = (error: string) => async () => new Response(JSON.stringify({ error }), { status: 402 });
    const a = useFamiliarVoice({ transport: refuse("insufficient_credits"), player: manualPlayer().player });
    a.setOn(true);
    a.say(input("A."));
    await tick();
    expect([a.broke.value, a.spent.value]).toEqual([true, false]);
    a.setOn(true);
    expect([a.broke.value, a.spent.value]).toEqual([false, false]);
    const b = useFamiliarVoice({ transport: refuse("quota"), player: manualPlayer().player });
    b.say(input("B."));
    await tick();
    expect([b.broke.value, b.spent.value]).toEqual([false, true]);
  });

  // Bug caught: one unprovable reply (404) stopping the ones behind it.
  it("skips a reply the server refuses (404) and plays the next", async () => {
    const p = manualPlayer();
    const voice = useFamiliarVoice({ transport: async (r) => (r.text === "Bad." ? new Response("{}", { status: 404 }) : ok("GOOD")), player: p.player });
    voice.setOn(true);
    voice.say(input("Bad.", "Good."));
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,GOOD"]);
  });

  // Bug caught: one account's choice switching voices on for another account on the same device.
  it("keeps the switch per account", () => {
    const voice = useFamiliarVoice();
    voice.setOn(true);
    expect(voice.on.value).toBe(true);
    useAuthStore().user = { id: "someone-else" } as User;
    expect(voice.on.value).toBe(false);
  });
});
