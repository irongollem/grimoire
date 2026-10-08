import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDemoKey,
  assertLoopbackStack,
  assertRemoteUrl,
  MissingRemoteTable,
  parseContentRange,
  remoteCount,
  remoteRows,
  type StackStatus,
} from "./dev-stack";

describe("assertRemoteUrl", () => {
  it("accepts the hosted project over https", () => {
    expect(assertRemoteUrl("https://abcd.supabase.co").hostname).toBe("abcd.supabase.co");
  });

  it("refuses the local stack, so the script can never pull from what it writes to", () => {
    expect(() => assertRemoteUrl("http://127.0.0.1:54321")).toThrow(/Refusing/);
    expect(() => assertRemoteUrl("https://localhost:54321")).toThrow(/Refusing/);
  });

  it("refuses plain http and a missing value", () => {
    expect(() => assertRemoteUrl("http://abcd.supabase.co")).toThrow(/Refusing/);
    expect(() => assertRemoteUrl(undefined)).toThrow(/VITE_SUPABASE_URL/);
  });
});

const LOCAL: StackStatus = {
  API_URL: "http://127.0.0.1:54321",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ANON_KEY: "anon",
  SERVICE_ROLE_KEY: "service",
};

describe("assertLoopbackStack", () => {
  it("accepts a stack that is loopback on both addresses", () => {
    expect(assertLoopbackStack(LOCAL)).toBe(LOCAL);
    expect(() => assertLoopbackStack({ ...LOCAL, API_URL: "http://localhost:54321" })).not.toThrow();
    expect(() => assertLoopbackStack({ ...LOCAL, API_URL: "http://[::1]:54321" })).not.toThrow();
  });

  it("refuses a hosted API address", () => {
    expect(() => assertLoopbackStack({ ...LOCAL, API_URL: "https://abcd.supabase.co" })).toThrow(/API_URL.*not loopback/);
  });

  it("refuses a hosted database address even when the API looks local", () => {
    expect(() =>
      assertLoopbackStack({ ...LOCAL, DB_URL: "postgresql://postgres:x@db.abcd.supabase.co:5432/postgres" }),
    ).toThrow(/DB_URL.*not loopback/);
  });

  it("refuses a lookalike host", () => {
    expect(() => assertLoopbackStack({ ...LOCAL, API_URL: "http://127.0.0.1.evil.example:54321" })).toThrow(/Refusing/);
  });
});

describe("assertDemoKey", () => {
  const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

  it("accepts the CLI's universal development key", () => {
    expect(() => assertDemoKey("SERVICE_ROLE_KEY", jwt({ iss: "supabase-demo", role: "service_role" }))).not.toThrow();
  });

  it("refuses any other issuer and anything that is not a JWT", () => {
    expect(() => assertDemoKey("SERVICE_ROLE_KEY", jwt({ iss: "supabase", ref: "abcd" }))).toThrow(/Refusing/);
    expect(() => assertDemoKey("SERVICE_ROLE_KEY", "not-a-jwt")).toThrow(/Refusing/);
  });
});

describe("parseContentRange", () => {
  it("reads the total after the slash", () => {
    expect(parseContentRange("0-0/236")).toBe(236);
    expect(parseContentRange("*/0")).toBe(0);
  });

  it("refuses a header it cannot read rather than report a zero", () => {
    expect(() => parseContentRange(null)).toThrow(/Content-Range/);
    expect(() => parseContentRange("0-0/*")).toThrow(/Content-Range/);
  });
});

describe("a table production does not have yet", () => {
  const remote = new URL("https://abcd.supabase.co");
  afterEach(() => vi.unstubAllGlobals());

  function answer(status: number, body: string) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
  }

  it("is MissingRemoteTable, so a pull can treat it as empty (the local schema runs ahead)", async () => {
    answer(404, JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.quest_embeddings'" }));
    await expect(remoteRows(remote, "k", "quest_embeddings", "", "id")).rejects.toBeInstanceOf(MissingRemoteTable);
    await expect(remoteCount(remote, "k", "quest_embeddings", "")).rejects.toBeInstanceOf(MissingRemoteTable);
  });

  it("does not swallow any other failure", async () => {
    answer(401, JSON.stringify({ message: "JWT expired" }));
    const read = remoteRows(remote, "k", "npcs", "", "id");
    await expect(read).rejects.toThrow(/Could not read npcs from production \(401\)/);
    await expect(read).rejects.not.toBeInstanceOf(MissingRemoteTable);
  });
});
