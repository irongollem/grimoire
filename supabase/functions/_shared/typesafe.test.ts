import { describe, expect, it, vi } from "vitest";
import { choiceOf, judge, noulOf, scoreOf, TypeSafeError, type JudgeRequest } from "./typesafe";

const KEY = "tsk-secret-key-123";
const request: JudgeRequest = {
  state: { imported: "Old Tom", existing: "Tom the innkeeper" },
  questions: { relation: { type: "score", instructions: "How do they relate?", criteria: ["a", "b", "c"] } },
};

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const OK = {
  model: "jev-1.14.0",
  answers: { relation: { type: "score", score: 1.7, confidence: 0.5 }, flag: { type: "noul", noul: 0.98 } },
  usage: { input_tokens: 120, output_tokens: 12 },
};

const noSleep = () => Promise.resolve();

describe("judge", () => {
  it("sends the bearer key, the alias model and the state, and returns the answering model and tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, OK));
    const result = await judge(request, { apiKey: KEY, fetch: fetchMock });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("jev-latest");
    expect(sent.state).toEqual(request.state);
    expect(result.model).toBe("jev-1.14.0");
    expect(result.inputTokens).toBe(120);
    expect(scoreOf(result, "relation")).toBe(1.7);
    expect(noulOf(result, "flag")).toBe(0.98);
  });

  it("a 429 is retried and the later success is returned (rate limits must not drop pairs)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(429)).mockResolvedValueOnce(reply(200, OK));
    const result = await judge(request, { apiKey: KEY, fetch: fetchMock, sleep: noSleep });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.model).toBe("jev-1.14.0");
  });

  it("a 529 is retried too", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(529)).mockResolvedValueOnce(reply(200, OK));
    await judge(request, { apiKey: KEY, fetch: fetchMock, sleep: noSleep });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after two retries instead of hammering a rate-limited account", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply(429)));
    await expect(judge(request, { apiKey: KEY, fetch: fetchMock, sleep: noSleep })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("a 400 is not retried (a malformed request fails identically every time)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400, { detail: "bad" }));
    await expect(judge(request, { apiKey: KEY, fetch: fetchMock, sleep: noSleep })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 422 is not retried", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(422, { detail: [] }));
    await expect(judge(request, { apiKey: KEY, fetch: fetchMock, sleep: noSleep })).rejects.toBeInstanceOf(TypeSafeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("neither the key nor the state appears in an error, for an HTTP failure or a network failure", async () => {
    const http = vi.fn().mockResolvedValue(reply(500, { detail: `echo ${KEY} Tom the innkeeper` }));
    const net = vi.fn().mockRejectedValue(new Error(`connect failed with ${KEY} Tom the innkeeper`));
    for (const fetchMock of [http, net]) {
      const err = await judge(request, { apiKey: KEY, fetch: fetchMock, sleep: noSleep }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TypeSafeError);
      const text = `${(err as Error).message} ${(err as Error).stack ?? ""}`;
      expect(text).not.toContain(KEY);
      expect(text).not.toContain("Tom the innkeeper");
    }
  });

  it("a request slower than the timeout is aborted and fails with status 0", async () => {
    const hang = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        (init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")));
      })
    );
    await expect(judge(request, { apiKey: KEY, fetch: hang, timeoutMs: 20 })).rejects.toMatchObject({ status: 0 });
    expect(hang).toHaveBeenCalledTimes(1);
  });

  it("a caller abort cancels the in-flight request", async () => {
    const controller = new AbortController();
    const hang = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        (init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")));
      })
    );
    const pending = judge(request, { apiKey: KEY, fetch: hang, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 0 });
  });

  it("a 200 with a body that is not the documented shape is an error, not an empty success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { nope: true }));
    await expect(judge(request, { apiKey: KEY, fetch: fetchMock })).rejects.toBeInstanceOf(TypeSafeError);
  });
});

describe("scoreOf / noulOf", () => {
  it("return null for a missing answer or one of the other type (never a made-up zero)", async () => {
    const result = await judge(request, { apiKey: KEY, fetch: vi.fn().mockResolvedValue(reply(200, OK)) });
    expect(scoreOf(result, "missing")).toBeNull();
    expect(scoreOf(result, "flag")).toBeNull();
    expect(noulOf(result, "relation")).toBeNull();
  });
});

describe("choiceOf", () => {
  const CHOICE = {
    model: "jev-1.14.0",
    answers: {
      pick: { type: "choice", choice: "Skeleton Archer", confidence: 0.7, probabilities: { "Skeleton Archer": 0.8, "none of these": 0.2 } },
      bad: { type: "choice", choice: "x" },
      scored: { type: "score", score: 1 },
    },
    usage: { input_tokens: 40, output_tokens: 5 },
  };

  it("returns the choice, confidence and probabilities of a choice answer (a dropped probability would make every repair look unsure)", async () => {
    const result = await judge(request, { apiKey: KEY, fetch: vi.fn().mockResolvedValue(reply(200, CHOICE)) });
    expect(choiceOf(result, "pick")).toEqual({
      choice: "Skeleton Archer",
      confidence: 0.7,
      probabilities: { "Skeleton Archer": 0.8, "none of these": 0.2 },
    });
  });

  it("is null for a malformed choice answer, an answer of another type and a missing name (never a guessed pick)", async () => {
    const result = await judge(request, { apiKey: KEY, fetch: vi.fn().mockResolvedValue(reply(200, CHOICE)) });
    expect(choiceOf(result, "bad")).toBeNull();
    expect(choiceOf(result, "scored")).toBeNull();
    expect(choiceOf(result, "absent")).toBeNull();
  });
});
