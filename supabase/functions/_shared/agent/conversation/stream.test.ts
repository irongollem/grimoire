import { describe, expect, it } from "vitest";
import { eventStreamResponse, refusalResponse, safeEmit } from "./stream.ts";

describe("safeEmit", () => {
  it("swallows a listener that throws, so a closed stream never costs the turn that is already paid for", () => {
    const emit = safeEmit<string>(() => { throw new Error("stream closed"); });
    expect(() => emit("x")).not.toThrow();
  });
});

describe("eventStreamResponse", () => {
  it("writes each event as a data line and closes when the run ends", async () => {
    const res = eventStreamResponse<{ n: number }>(async (send) => { send({ n: 1 }); send({ n: 2 }); });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(await res.text()).toBe('data: {"n":1}\n\ndata: {"n":2}\n\n');
  });
});

describe("refusalResponse", () => {
  it("answers a code as the error and a sentence as the message", async () => {
    expect(await refusalResponse({ status: 429, error: "rate_limited" }).json()).toEqual({ error: "rate_limited" });
    expect(await refusalResponse({ status: 403, error: "Only the DM." }).json()).toEqual({ error: "refused", message: "Only the DM." });
  });
});
