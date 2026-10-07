import { describe, expect, it } from "vitest";
import { assertDemoKey, assertLoopbackStack, assertRemoteUrl, type StackStatus } from "./dev-stack";

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
