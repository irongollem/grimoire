import { describe, expect, it } from "vitest";
import { readEventStream } from "./readEventStream";

function responseOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
        c.close();
      },
    }),
  );
}

const parse = (raw: unknown) => (typeof raw === "object" && raw !== null && "n" in raw && typeof raw.n === "number" ? raw.n : null);
const ev = (n: unknown) => `data: ${JSON.stringify({ n })}\n\n`;

async function collect(r: Response): Promise<number[]> {
  const out: number[] = [];
  for await (const n of readEventStream(r, parse)) out.push(n);
  return out;
}

describe("readEventStream", () => {
  // Bug caught: parsing per chunk drops an event cut by the network.
  it("joins an event split across chunks", async () => {
    const whole = ev(7);
    expect(await collect(responseOf([whole.slice(0, 9), whole.slice(9)]))).toEqual([7]);
  });

  // Bug caught: a payload the parser rejects (or invalid JSON, or a keep-alive comment) ending the stream.
  it("skips what the parser rejects and carries on", async () => {
    expect(await collect(responseOf([": keep-alive\n\n", "data: {nope\n\n", ev("x"), ev(2)]))).toEqual([2]);
  });

  // Bug caught: a half block at the end of the stream being guessed at.
  it("drops a block the stream ended in the middle of", async () => {
    expect(await collect(responseOf([ev(1), 'data: {"n":'] ))).toEqual([1]);
  });
});
