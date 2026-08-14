import { describe, it, expect, vi } from "vitest";
import {
  parseDsn,
  parseStackFrames,
  buildEdgeEvent,
  buildEnvelope,
  captureEdgeError,
  functionNameFromUrl,
} from "./sentryEdge.ts";

const CONFIG = {
  dsn: "https://c1c40bc0e668b8d9fd6f5a8f7e4722ec@o4511905700708352.ingest.de.sentry.io/4511905720369232",
  environment: "production",
};

describe("parseDsn", () => {
  it("derives the EU envelope endpoint and public key", () => {
    expect(parseDsn(CONFIG.dsn)).toEqual({
      endpoint: "https://o4511905700708352.ingest.de.sentry.io/api/4511905720369232/envelope/",
      publicKey: "c1c40bc0e668b8d9fd6f5a8f7e4722ec",
    });
  });

  it("returns null for a malformed DSN rather than throwing inside an error handler", () => {
    expect(parseDsn("not-a-dsn")).toBeNull();
    expect(parseDsn("https://sentry.io/123")).toBeNull();
  });
});

describe("parseStackFrames", () => {
  it("parses V8 frames and reverses them into Sentry's oldest-first order", () => {
    const frames = parseStackFrames(
      [
        "Error: boom",
        "    at generateNpc (file:///src/functions/generate-npc/index.ts:42:11)",
        "    at async handler (file:///src/functions/_shared/cors.ts:57:13)",
      ].join("\n"),
    );

    expect(frames).toEqual([
      {
        filename: "file:///src/functions/_shared/cors.ts",
        function: "handler",
        lineno: 57,
        colno: 13,
        in_app: true,
      },
      {
        filename: "file:///src/functions/generate-npc/index.ts",
        function: "generateNpc",
        lineno: 42,
        colno: 11,
        in_app: true,
      },
    ]);
  });

  it("parses an anonymous frame with no function name", () => {
    expect(parseStackFrames("    at file:///src/index.ts:1:2")).toEqual([
      { filename: "file:///src/index.ts", lineno: 1, colno: 2, in_app: true },
    ]);
  });

  it("marks registry code as out-of-app so our own frames expand by default", () => {
    const frames = parseStackFrames(
      [
        "    at ours (file:///src/index.ts:1:2)",
        "    at theirs (https://esm.sh/stripe@22.4.0/index.js:9:9)",
      ].join("\n"),
    );

    expect(frames.find((f) => f.function === "ours")?.in_app).toBe(true);
    expect(frames.find((f) => f.function === "theirs")?.in_app).toBe(false);
  });

  it("ignores the message line and any unparseable noise", () => {
    expect(parseStackFrames("Error: boom\n  <anonymous>\n")).toEqual([]);
  });
});

describe("buildEdgeEvent", () => {
  it("tags the function and marks the error handled", () => {
    const event = buildEdgeEvent(
      new Error("boom"),
      { functionName: "generate-npc", url: "https://x.supabase.co/generate-npc", method: "POST" },
      CONFIG,
      "abc123",
      1_700_000_000,
    );

    expect(event["tags"]).toEqual({ edge_function: "generate-npc", runtime: "supabase-edge" });
    expect(event["environment"]).toBe("production");
    expect(event["event_id"]).toBe("abc123");

    const values = (event["exception"] as { values: Record<string, unknown>[] }).values;
    expect(values[0]?.["type"]).toBe("Error");
    expect(values[0]?.["value"]).toBe("boom");
    expect(values[0]?.["mechanism"]).toEqual({ type: "withCors", handled: true });
  });

  it("scrubs PII out of the error message", () => {
    const event = buildEdgeEvent(
      new Error("no credits for jeffrey@crocode.nl using sk-ant-api03-AAAABBBBCCCCDDDD"),
      { functionName: "deduct-ai-credit" },
      CONFIG,
      "abc123",
      1_700_000_000,
    );

    const values = (event["exception"] as { values: Record<string, unknown>[] }).values;
    expect(values[0]?.["value"]).toBe("no credits for [email] using [key]");
  });

  it("handles a thrown non-Error without a stack", () => {
    const event = buildEdgeEvent("just a string", { functionName: "mcp" }, CONFIG, "id", 1);
    const values = (event["exception"] as { values: Record<string, unknown>[] }).values;

    expect(values[0]?.["type"]).toBe("UnknownError");
    expect(values[0]?.["value"]).toBe("just a string");
    expect(values[0]).not.toHaveProperty("stacktrace");
  });

  it("omits request entirely when there is no url", () => {
    const event = buildEdgeEvent(new Error("x"), { functionName: "cron" }, CONFIG, "id", 1);
    expect(event).not.toHaveProperty("request");
  });
});

describe("buildEnvelope", () => {
  it("emits the three newline-separated lines Sentry expects", () => {
    const event = { event_id: "abc123", level: "error" };
    const lines = buildEnvelope(event, CONFIG.dsn).split("\n");

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!)).toEqual({ event_id: "abc123", dsn: CONFIG.dsn });
    expect(JSON.parse(lines[1]!)).toEqual({ type: "event", content_type: "application/json" });
    expect(JSON.parse(lines[2]!)).toEqual(event);
  });
});

describe("captureEdgeError", () => {
  it("POSTs an authenticated envelope to the EU ingest endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));

    await captureEdgeError(
      new Error("boom"),
      { functionName: "generate-npc", url: "https://x.supabase.co/generate-npc?token=secret" },
      CONFIG,
      { fetch: fetchMock, eventId: "abc123", now: () => 1_700_000_000_000 },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(
      "https://o4511905700708352.ingest.de.sentry.io/api/4511905720369232/envelope/",
    );
    expect((init.headers as Record<string, string>)["X-Sentry-Auth"]).toContain(
      "sentry_key=c1c40bc0e668b8d9fd6f5a8f7e4722ec",
    );

    // The query string carried a token; it must not reach the wire.
    expect(init.body).not.toContain("secret");
    expect(init.body).toContain("[redacted]");
  });

  it("never rejects when ingest is down — reporting a failure must not add one", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      captureEdgeError(new Error("boom"), { functionName: "x" }, CONFIG, { fetch: fetchMock }),
    ).resolves.toBeUndefined();

    consoleError.mockRestore();
  });

  it("does not attempt a request when the DSN is malformed", async () => {
    const fetchMock = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await captureEdgeError(
      new Error("boom"),
      { functionName: "x" },
      { dsn: "garbage", environment: "production" },
      { fetch: fetchMock },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("functionNameFromUrl", () => {
  it.each([
    ["https://x.supabase.co/generate-npc", "generate-npc"],
    ["https://x.supabase.co/functions/v1/generate-npc", "generate-npc"],
    ["https://x.supabase.co/generate-npc/sub/path?a=b", "generate-npc"],
    ["https://x.supabase.co/", "unknown"],
    ["not a url", "unknown"],
  ])("%s → %s", (url, expected) => {
    expect(functionNameFromUrl(url)).toBe(expected);
  });
});
