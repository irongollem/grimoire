import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import type { RollAnswer } from "@/lib/table/soloTypes";
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

describe("useTableTurn with a roll", () => {
  const ask = { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception" } as const;
  const echo = { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: false };
  const answer: RollAnswer = { faces: [13], mode: "normal", bonus: 4, atTable: false };
  const asking = () => sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "Roll." }, { type: "ask_roll", roll: { ...ask, dc: 15 } }, { type: "done", end: "end_turn", credits: 0, tokens: 1 });
  const rolledTurn = () => sse({ type: "session", sessionId: "s1" }, { type: "rolled", roll: echo }, { type: "text", delta: "You spot it." }, { type: "done", end: "end_turn", credits: 0, tokens: 1 });

  // Bug caught: the card never appearing because the stream's ask was dropped, or keeping the number to beat.
  it("holds the ask a kept turn ends with, without the number to beat", async () => {
    const asks: unknown[] = [];
    const t = sitting(async () => streamOf(asking()), { onAskRoll: (a) => asks.push(a) });
    await t.send("say", "I listen.");
    expect(asks).toEqual([null, ask]);
  });

  // Bug caught: the card staying after the player answered some other way, so a second roll is sent the server refuses.
  it("clears the ask when any turn is sent, with a roll or without one", async () => {
    for (const roll of [answer, null]) {
      const asks: unknown[] = [];
      const t = sitting(async () => streamOf(rolledTurn()), { onAskRoll: (a) => asks.push(a) });
      t.setAsked(ask);
      await t.send("say", roll === null ? "Never mind." : "", roll);
      expect(asks.at(-1)).toBeNull();
    }
  });

  // Bug caught: the roll left off the request, or sent with no words refused as an empty message.
  it("sends the roll with an empty message and draws the server's echo, with no player line", async () => {
    const seen: TurnRequest[] = [];
    const t = sitting(async (request) => {
      seen.push(request);
      return streamOf(rolledTurn());
    });
    expect(await t.send("do", "", answer)).toBe(true);
    expect(seen[0]).toMatchObject({ message: "", roll: answer });
    expect(t.live.value.map((i) => i.kind)).toEqual(["roll", "narration"]);
  });

  // Bug caught: a roll sent in a request that has none asked for (the server answers 400), or an empty turn sent.
  it("sends no roll key unless one is given, and refuses an empty message with no roll", async () => {
    const seen: TurnRequest[] = [];
    const t = sitting(async (request) => {
      seen.push(request);
      return streamOf(rolledTurn());
    });
    expect(await t.send("do", "")).toBe(false);
    await t.send("do", "I look.");
    expect(seen[0]).not.toHaveProperty("roll");
  });

  // Bug caught: a failed roll turn losing the card (the server still waits) and the roll line staying on the page.
  it("brings the ask back and drops the roll line when the turn is not kept, and resends the same roll", async () => {
    const seen: TurnRequest[] = [];
    const asks: unknown[] = [];
    let n = 0;
    const t = sitting(
      async (request) => {
        seen.push(request);
        return ++n === 1 ? streamOf(sse({ type: "session", sessionId: "s1" }, { type: "rolled", roll: echo })) : streamOf(rolledTurn());
      },
      { onAskRoll: (a) => asks.push(a) },
    );
    t.setAsked(ask);
    await t.send("do", "I look.", answer);
    expect(asks.at(-1)).toEqual(ask);
    expect(t.live.value.map((i) => i.kind)).toEqual(["player"]);
    expect(t.live.value[0]).toMatchObject({ unsent: true });
    expect(t.failure.value).not.toBeNull();
    await t.resend();
    expect(seen[1]).toMatchObject({ message: "I look.", roll: answer });
    expect(t.live.value.map((i) => i.kind)).toEqual(["roll", "player", "narration"]);
  });
});

describe("useTableTurn: opening the scene", () => {
  // Bug caught: the opening sent with a player line on the page, or without saying it is one.
  it("asks the Dungeon Master to open with no words of the player's, and draws what comes back", async () => {
    const sent: TurnRequest[] = [];
    const t = sitting(async (request) => {
      sent.push(request);
      return streamOf(good(0));
    });
    expect(await t.open()).toBe(true);
    expect(sent).toEqual([{ campaignId: "c1", message: "", mode: "do", opening: true, startLocationId: "l1", characterId: "m1" }]);
    expect(t.live.value.map((i) => i.kind)).toEqual(["narration", "spoken"]);
  });

  // Bug caught: a second opening restarting the scene of a story that is already on the page.
  it("opens nothing once the sitting has begun or the page holds anything", async () => {
    const sent: TurnRequest[] = [];
    const t = sitting(async (request) => {
      sent.push(request);
      return streamOf(good(0));
    });
    await t.open();
    expect(await t.open()).toBe(false);
    const begun = useTableTurn({ campaignId: () => "c1", sessionId: "s9", transport: async () => streamOf(good(0)) });
    expect(await begun.open()).toBe(false);
    expect(sent).toHaveLength(1);
  });

  // Bug caught: Send again after a refused opening sending an empty ordinary message, which the server refuses.
  it("sends the opening again after it was refused", async () => {
    const sent: TurnRequest[] = [];
    let first = true;
    const t = sitting(async (request) => {
      sent.push(request);
      if (first) {
        first = false;
        return refusal(503, "x");
      }
      return streamOf(good(0));
    });
    await t.open();
    expect(t.failure.value).not.toBeNull();
    expect(await t.resend()).toBe(true);
    expect(sent[1]).toMatchObject({ opening: true, message: "" });
    expect(t.live.value.map((i) => i.kind)).toEqual(["narration", "spoken"]);
  });

  // Bug caught: an ordinary message after the opening still flagged as one, which the server refuses on a begun sitting.
  it("sends what the player says next as an ordinary turn", async () => {
    const sent: TurnRequest[] = [];
    const t = sitting(async (request) => {
      sent.push(request);
      return streamOf(good(0));
    });
    await t.open();
    await t.send("say", "Hello.");
    expect(sent[1].opening).toBeUndefined();
    expect(sent[1].sessionId).toBe("s1");
  });
});

describe("a helper's turn in a fight", () => {
  // Bug caught: the helper's turn sent as words of the player's (a line of theirs on the page, a turn of theirs
  // spent), or asked before any conversation exists.
  it("asks for it by name with no words of the player's, and only once a conversation exists", async () => {
    const sent: TurnRequest[] = [];
    const t = sitting(async (request) => {
      sent.push(request);
      return streamOf(good());
    });
    expect(await t.helper("Apprentice Honeycomb")).toBe(false);
    await t.send("say", "Hello?");
    expect(await t.helper("Apprentice Honeycomb")).toBe(true);
    expect(sent[1]).toMatchObject({ message: "", helperTurn: { name: "Apprentice Honeycomb" } });
    expect(t.live.value.filter((item) => item.kind === "player")).toHaveLength(1);
  });
});

describe("the characters going on while the player listens", () => {
  const done = (floor?: "characters") => sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "They talk on." }, { type: "done", end: "done", credits: 0, tokens: 1, ...(floor ? { floor } : {}) });

  // Bug caught: the page told the floor is the player's when the server said the characters still had it (or the
  // other way round), so a conversation either stops dead or runs on over the player.
  it("passes on whose floor it is when a turn is kept", async () => {
    const floors: string[] = [];
    let n = 0;
    const t = sitting(async () => streamOf(++n === 1 ? done("characters") : done()), { onDone: (floor) => floors.push(floor) });
    await t.send("do", "I sit by the fire.");
    await t.send("do", "I keep listening.");
    expect(floors).toEqual(["characters", "player"]);
  });

  // Bug caught: the listening turn sent as an ordinary message with invented words of the player's, or drawn on
  // the page as something the player said.
  it("sends a listening turn with no words, and draws no line of the player's for it", async () => {
    const requests: TurnRequest[] = [];
    const t = sitting(async (request) => {
      requests.push(request);
      return streamOf(done());
    });
    await t.send("do", "I sit by the fire.");
    const before = t.live.value.filter((i) => i.kind === "player").length;
    expect(await t.listen()).toBe(true);
    expect(requests[1]).toMatchObject({ message: "", listening: true });
    expect(t.live.value.filter((i) => i.kind === "player").length).toBe(before);
  });

  // Bug caught: a listening turn sent before any conversation exists.
  it("cannot listen in a sitting that has not begun", async () => {
    const t = sitting(async () => streamOf(done()));
    expect(await t.listen()).toBe(false);
  });
});
