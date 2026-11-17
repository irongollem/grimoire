import { describe, expect, it } from "vitest";
import { parseTableEvent, parseTablePressure, readTableStream } from "./readTableStream";
import type { TableEvent } from "./soloTypes";

/** A Response whose body arrives in exactly these chunks, as a network might cut it. */
function responseOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

async function collect(response: Response): Promise<TableEvent[]> {
  const events: TableEvent[] = [];
  for await (const event of readTableStream(response)) events.push(event);
  return events;
}

const text = (delta: string) => `data: ${JSON.stringify({ type: "text", delta })}\n\n`;

describe("readTableStream", () => {
  // Bug caught: parsing each network chunk on its own throws (or drops the event) when a chunk boundary falls inside
  // an event, which a real connection does all the time.
  it("reads an event that is split across two chunks", async () => {
    const whole = text("The lane smells of caramel.");
    const events = await collect(responseOf([whole.slice(0, 20), whole.slice(20)]));
    expect(events).toEqual([{ type: "text", delta: "The lane smells of caramel." }]);
  });

  // Bug caught: taking one event per chunk loses every event after the first when the network batches them.
  it("reads two events that arrive in one chunk, in order", async () => {
    const events = await collect(responseOf([text("one") + text("two")]));
    expect(events).toEqual([
      { type: "text", delta: "one" },
      { type: "text", delta: "two" },
    ]);
  });

  // Bug caught: a split inside a multi-byte character decoded per chunk turns it into replacement characters.
  it("keeps a character that is split across two chunks whole", async () => {
    const bytes = new TextEncoder().encode(text("café"));
    const cut = bytes.length - 5; // inside the two bytes of "e acute"
    const encoder = { a: bytes.slice(0, cut), b: bytes.slice(cut) };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.a);
        controller.enqueue(encoder.b);
        controller.close();
      },
    });
    const events = await collect(new Response(body));
    expect(events).toEqual([{ type: "text", delta: "café" }]);
  });

  // Bug caught: one malformed or unknown event killing the whole turn instead of being skipped.
  it("skips an event it cannot read and carries on", async () => {
    const events = await collect(
      responseOf(["data: {not json\n\n", `data: ${JSON.stringify({ type: "from_the_future" })}\n\n`, ": keep-alive\n\n", text("still here")]),
    );
    expect(events).toEqual([{ type: "text", delta: "still here" }]);
  });

  // Bug caught: a half event at the end of a broken stream guessed at and shown as if it were whole.
  it("drops an event the stream ended in the middle of", async () => {
    const events = await collect(responseOf([text("kept"), 'data: {"type":"text","delta":"hal']));
    expect(events).toEqual([{ type: "text", delta: "kept" }]);
  });

  // Bug caught: a line whose speaker is null taken for a malformed one, so a crowd's words vanish.
  it("reads a line from a speaker with no record", async () => {
    const line = { kind: "spoken", speaker: { id: null, name: "A passer-by" }, text: "Mind the step.", to: "Inkling" };
    const events = await collect(responseOf([`data: ${JSON.stringify({ type: "line", line })}\n\n`]));
    expect(events).toEqual([{ type: "line", line }]);
  });

  // Bug caught: a done event without numbers turning the cost meter into NaN.
  it("reads credits as a number even when the server leaves them out", async () => {
    const events = await collect(responseOf([`data: ${JSON.stringify({ type: "done", end: "end_turn" })}\n\n`]));
    expect(events).toEqual([{ type: "done", end: "end_turn", credits: 0, tokens: 0 }]);
  });
});

describe("parseTablePressure", () => {
  // Bug caught: pips drawn from a clock fuller than it is long, a fraction, or no length at all.
  it.each([
    ["fuller than it is long", { filled: 5, segments: 4 }],
    ["a negative fill", { filled: -1, segments: 4 }],
    ["no segments", { filled: 0, segments: 0 }],
    ["a fraction", { filled: 1.5, segments: 4 }],
    ["text for a number", { filled: "1", segments: 4 }],
    ["longer than any quest clock", { filled: 1, segments: 25 }],
  ])("refuses a clock with %s", (_what, raw) => {
    expect(parseTablePressure(raw)).toBeNull();
  });

  it("reads a full clock and an empty one, the two ends the page draws differently", () => {
    expect(parseTablePressure({ filled: 4, segments: 4, label: "never kept" })).toEqual({ filled: 4, segments: 4 });
    expect(parseTablePressure({ filled: 0, segments: 3 })).toEqual({ filled: 0, segments: 3 });
  });
});

describe("parseTableEvent for pressure", () => {
  // Bug caught: a malformed pressure event read as "the pressure came off", taking a running clock off the page.
  it("reads an explicit null as the pressure coming off, and skips a malformed one instead", () => {
    expect(parseTableEvent({ type: "pressure", pressure: null })).toEqual({ type: "pressure", pressure: null });
    expect(parseTableEvent({ type: "pressure", pressure: { filled: 9, segments: 2 } })).toBeNull();
    expect(parseTableEvent({ type: "pressure" })).toBeNull();
  });
});

describe("parseTableEvent for rolls", () => {
  const roll = { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: false };

  it("reads a request to roll and the echo of a roll", () => {
    expect(parseTableEvent({ type: "ask_roll", roll: { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception", dc: 15 } })).toEqual({
      type: "ask_roll",
      roll: { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception" },
    });
    expect(parseTableEvent({ type: "rolled", roll })).toEqual({ type: "rolled", roll });
  });

  // Bug caught: a malformed roll event taking the page down, or drawing a card or a total from nonsense.
  it("skips a malformed ask or echo", () => {
    expect(parseTableEvent({ type: "ask_roll", roll: { label: "x", kind: "check", ability: "luck", skill: null } })).toBeNull();
    expect(parseTableEvent({ type: "ask_roll" })).toBeNull();
    expect(parseTableEvent({ type: "rolled", roll: { ...roll, total: 99 } })).toBeNull();
    expect(parseTableEvent({ type: "rolled", roll: { ...roll, kept: 2 } })).toBeNull();
  });
});
