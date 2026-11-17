import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";
import { useTableVoice, type VoicePlayer, type VoiceRequest } from "./useTableVoice";

const ok = (audio = "AAAA") => new Response(JSON.stringify({ audio, mime: "audio/mpeg" }), { status: 200, headers: { "content-type": "application/json" } });
const line = (text: string) => ({ speakerId: "n1", speakerName: "Honeycomb", text, how: null, key: "k" });

/** A player whose clips end only when the test says so, and which records what was played and what was cut short. */
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

function setUp() {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u1" } as User;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  safeLocalStorage().clear();
  setUp();
});

describe("useTableVoice", () => {
  // Bug caught: a page that starts talking (and spending) without anyone having asked for it.
  it("voices nothing until the player switches voices on", async () => {
    const sent: VoiceRequest[] = [];
    const p = manualPlayer();
    const voice = useTableVoice({ campaignId: () => "c1", sessionId: () => "s1", transport: async (r) => { sent.push(r); return ok(); }, player: p.player });
    voice.say([line("Hello.")]);
    await tick();
    expect(sent).toEqual([]);
    voice.setEnabled(true);
    voice.say([line("Hello.")]);
    await tick();
    expect(sent).toEqual([{ campaignId: "c1", sessionId: "s1", speakerId: "n1", speakerName: "Honeycomb", text: "Hello.", how: null, key: "k" }]);
  });

  // Bug caught: two characters talking over each other, or the second line playing first.
  it("plays the lines one after another, in the order they were said", async () => {
    const p = manualPlayer();
    const voice = useTableVoice({ campaignId: () => "c1", sessionId: () => "s1", transport: async (r) => ok(r.text === "First." ? "ONE" : "TWO"), player: p.player });
    voice.setEnabled(true);
    voice.say([line("First."), line("Second.")]);
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,ONE"]);
    p.finish[0]();
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,ONE", "data:audio/mpeg;base64,TWO"]);
  });

  // Bug caught: the second voice only asked for once the first has finished playing, so every line after the first is late.
  it("asks for every line at once, and still plays them in order when the second comes back first", async () => {
    const p = manualPlayer();
    const sent: string[] = [];
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const voice = useTableVoice({
      campaignId: () => "c1",
      sessionId: () => "s1",
      transport: async (r) => {
        sent.push(r.text);
        if (r.text === "First.") await firstHeld;
        return ok(r.text === "First." ? "ONE" : "TWO");
      },
      player: p.player,
    });
    voice.setEnabled(true);
    voice.say([line("First."), line("Second.")]);
    await tick();
    expect(sent).toEqual(["First.", "Second."]);
    expect(p.played).toEqual([]);
    releaseFirst();
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,ONE"]);
  });

  // Bug caught: muting that lets the line in progress finish, or lets the queued ones start afterwards.
  it("falls silent at once when switched off, and plays nothing that was waiting", async () => {
    const p = manualPlayer();
    const voice = useTableVoice({ campaignId: () => "c1", sessionId: () => "s1", transport: async () => ok(), player: p.player });
    voice.setEnabled(true);
    voice.say([line("First."), line("Second.")]);
    await tick();
    voice.setEnabled(false);
    await tick();
    expect(p.stopped).toHaveLength(1);
    expect(p.played).toHaveLength(1);
  });

  // Bug caught: a server without voices being asked again for every line of the sitting.
  it("stops asking once the server says voices are not switched on", async () => {
    let calls = 0;
    const voice = useTableVoice({ campaignId: () => "c1", sessionId: () => "s1", transport: async () => { calls++; return new Response("{}", { status: 503 }); }, player: manualPlayer().player });
    voice.setEnabled(true);
    voice.say([line("First."), line("Second.")]);
    await tick();
    expect(voice.unavailable.value).toBe(true);
    // Both lines of the turn were asked for together; nothing is asked after the answer.
    const asked = calls;
    voice.say([line("Third.")]);
    await tick();
    expect(calls).toBe(asked);
  });

  // Bug caught: one line the server refuses (or a dropped connection) silencing everything after it.
  it("skips a line that cannot be voiced and goes on with the next", async () => {
    const p = manualPlayer();
    let n = 0;
    const voice = useTableVoice({
      campaignId: () => "c1", sessionId: () => "s1", player: p.player,
      transport: async () => { n++; if (n === 1) return new Response("{}", { status: 404 }); if (n === 2) throw new Error("offline"); return ok("THREE"); },
    });
    voice.setEnabled(true);
    voice.say([line("One."), line("Two."), line("Three.")]);
    await tick();
    await tick();
    expect(p.played).toEqual(["data:audio/mpeg;base64,THREE"]);
  });

  // Bug caught: the choice kept for the browser instead of the account, so one person's setting speaks for another.
  it("remembers the choice for this account only", () => {
    const mine = useTableVoice({ campaignId: () => "c1", sessionId: () => "s1", transport: async () => ok(), player: manualPlayer().player });
    mine.setEnabled(true);
    expect(mine.enabled.value).toBe(true);
    useAuthStore().user = { id: "u2" } as User;
    expect(mine.enabled.value).toBe(false);
  });
});
