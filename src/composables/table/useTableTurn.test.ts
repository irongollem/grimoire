import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { useTableTurn, type TurnRequest, type TurnTransport } from "./useTableTurn";

const enc = new TextEncoder();
const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

function streamOf(body: string, opts: { hang?: AbortSignal } = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(body));
      if (opts.hang) {
        // The answer is still being written: the stream stays open until the request is aborted.
        opts.hang.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      } else controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}

const refusal = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });

function sitting(transport: TurnTransport, extra: Partial<Parameters<typeof useTableTurn>[0]> = {}) {
  return useTableTurn({ campaignId: () => "c1", sessionId: null, characterId: () => "m1", startLocationId: () => "l1", transport, ...extra });
}

const good = (credits = 1) =>
  sse(
    { type: "session", sessionId: "s1" },
    { type: "text", delta: "The lane smells of rain." },
    { type: "line", line: { kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Hello." } },
    { type: "done", end: "end_turn", credits, tokens: 10 },
  );

describe("useTableTurn", () => {
  it("puts the player's move first, then the narration and the line as they arrive", async () => {
    const t = sitting(async () => streamOf(good()));
    await t.send("say", "  Who are you?  ");
    expect(t.live.value.map((i) => i.kind)).toEqual(["player", "narration", "spoken"]);
    expect(t.live.value[0]).toMatchObject({ mode: "say", text: "Who are you?" });
    expect(t.failure.value).toBeNull();
    expect(t.running.value).toBe(false);
  });

  // Bug caught: the character and the starting place sent on every turn, which the server refuses on a continued
  // conversation; or never sent on the first, so the story begins about nobody.
  it("sends the character and place with a new conversation only, then the session id", async () => {
    const seen: TurnRequest[] = [];
    const t = sitting(async (request) => {
      seen.push(request);
      return streamOf(good());
    });
    await t.send("say", "One");
    await t.send("do", "Two");
    expect(seen[0]).toMatchObject({ campaignId: "c1", mode: "say", message: "One", characterId: "m1", startLocationId: "l1" });
    expect(seen[0]).not.toHaveProperty("sessionId");
    expect(seen[1]).toMatchObject({ mode: "do", sessionId: "s1" });
    expect(seen[1]).not.toHaveProperty("characterId");
    expect(seen[1]).not.toHaveProperty("startLocationId");
  });

  // Bug caught: the cost meter forgetting turns, or counting a refused one.
  it("adds the credits of each kept turn and none for a refused one", async () => {
    let n = 0;
    const t = sitting(async () => (++n === 2 ? refusal(429, "rate_limited") : streamOf(good(2))));
    await t.send("say", "a");
    await t.send("say", "b");
    await t.resend();
    expect(t.credits.value).toBe(4);
  });

  // Bug caught: a second Enter while a turn runs sending a second request at the same story.
  it("sends nothing while a turn is running, and nothing for an empty line", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const t = sitting(async () => {
      calls += 1;
      await gate;
      return streamOf(good());
    });
    const first = t.send("say", "one");
    expect(t.running.value).toBe(true);
    expect(await t.send("say", "two")).toBe(false);
    expect(await t.send("say", "   ")).toBe(false);
    release();
    await first;
    expect(calls).toBe(1);
  });

  // Bug caught: Stop discarding what was already written (it is what the player pays for), or hanging as "running".
  it("on Stop keeps what was said, notes it, and unlocks", async () => {
    const t = sitting(async (_request, signal) =>
      streamOf(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "You drop from the sill into a room" }), { hang: signal }),
    );
    const sent = t.send("do", "I climb in.");
    await vi.waitFor(() => expect(t.live.value.some((i) => i.kind === "narration")).toBe(true));
    t.stop();
    await sent;
    expect(t.running.value).toBe(false);
    expect(t.failure.value).toBeNull();
    expect(t.live.value.map((i) => i.kind)).toEqual(["player", "narration", "margin"]);
    expect(t.live.value[1]).toMatchObject({ text: "You drop from the sill into a room" });
    expect(t.live.value[2]).toMatchObject({ text: "You stopped the answer here" });
  });

  describe("when it goes wrong", () => {
    // Bug caught: the player's words dropped when a turn fails, so they have to type them again.
    it("keeps the player's line, muted, and drops what the failed turn wrote", async () => {
      const t = sitting(async () =>
        streamOf(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "Half an answer" }, { type: "error", message: "provider broke" })),
      );
      await t.send("do", "I draw my knife.");
      expect(t.live.value).toHaveLength(1);
      expect(t.live.value[0]).toMatchObject({ kind: "player", mode: "do", text: "I draw my knife.", unsent: true });
      expect(t.failure.value?.action).toBe("resend");
      expect(t.failure.value?.message).not.toContain("provider broke");
    });

    // Bug caught: Send again resending in the default mode (say) after a Do failed, or adding the line a second time.
    it("Send again resends the same message in the same mode, without adding the line twice", async () => {
      const seen: TurnRequest[] = [];
      let n = 0;
      const t = sitting(async (request) => {
        seen.push(request);
        return ++n === 1 ? refusal(503, "The AI table cannot be metered right now.") : streamOf(good());
      });
      await t.send("do", "I draw my knife.");
      expect(t.failure.value).not.toBeNull();
      await t.resend();
      expect(seen.map((r) => [r.mode, r.message])).toEqual([["do", "I draw my knife."], ["do", "I draw my knife."]]);
      expect(t.live.value.filter((i) => i.kind === "player")).toHaveLength(1);
      expect(t.live.value[0]).toMatchObject({ unsent: false });
      expect(t.failure.value).toBeNull();
    });

    // Bug caught: a stream cut off before `done` shown as a finished answer (the server keeps a turn only after done).
    it("treats a stream that ends without done as not kept", async () => {
      const t = sitting(async () => streamOf(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "Cut off" })));
      await t.send("say", "Hello");
      expect(t.failure.value?.action).toBe("resend");
      expect(t.live.value.map((i) => i.kind)).toEqual(["player"]);
    });

    // Bug caught: a dropped connection leaving the composer locked forever.
    it("unlocks after a network failure", async () => {
      const t = sitting(async () => {
        throw new TypeError("Failed to fetch");
      });
      await t.send("say", "Hello");
      expect(t.running.value).toBe(false);
      expect(t.failure.value?.action).toBe("resend");
    });

    // Bug caught: the 402 offering a retry that fails the same way.
    it("offers credits when the balance cannot cover the turn", async () => {
      const t = sitting(async () => refusal(402, "insufficient_credits"));
      await t.send("say", "Hello");
      expect(t.failure.value?.action).toBe("credits");
    });

    // Bug caught: Send again with nothing failed (a stray click) sending the last message a second time.
    it("does nothing on Send again when no turn failed", async () => {
      let calls = 0;
      const t = sitting(async () => {
        calls += 1;
        return streamOf(good());
      });
      await t.send("say", "Hello");
      expect(await t.resend()).toBe(false);
      expect(calls).toBe(1);
    });
  });

  // Bug caught: a turn still winding down from the old conversation writing into the new one after the address changed.
  it("writes nothing into the story after the screen moved to another conversation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = sitting(async () => {
      await gate;
      return streamOf(good());
    });
    const sent = t.send("say", "Hello");
    t.reset("other-session");
    release();
    await sent;
    expect(t.live.value).toEqual([]);
    expect(t.sessionId.value).toBe("other-session");
    expect(t.running.value).toBe(false);
  });

  it("tells the screen when the conversation gets its id and when the party arrives", async () => {
    const onSession = vi.fn();
    const onScene = vi.fn();
    const onDone = vi.fn();
    const t = sitting(
      async () => streamOf(sse({ type: "session", sessionId: "s9" }, { type: "scene", scene: { id: "l2", name: "The Cellar" } }, { type: "done", end: "end_turn", credits: 1, tokens: 1 })),
      { onSession, onScene, onDone },
    );
    await t.send("say", "Go");
    expect(onSession).toHaveBeenCalledWith("s9");
    expect(onScene).toHaveBeenCalledWith({ id: "l2", name: "The Cellar" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
