import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticate, readJsonBody } from "./respond";

function clientReturning(result: { data: { user: { id: string } | null }; error: unknown }) {
  return vi.fn(() => ({ auth: { getUser: async () => result } }) as unknown as SupabaseClient);
}

const post = (headers: Record<string, string> = {}) => new Request("https://x/fn", { method: "POST", headers, body: "{}" });

describe("authenticate", () => {
  it("refuses a request with no Authorization header without asking auth", async () => {
    const clientFor = clientReturning({ data: { user: { id: "u" } }, error: null });
    const res = await authenticate(post(), ["POST"], clientFor);
    expect((res as Response).status).toBe(401);
    expect(clientFor).not.toHaveBeenCalled();
  });

  it("refuses a token auth rejects", async () => {
    const res = await authenticate(post({ Authorization: "Bearer bad" }), ["POST"], clientReturning({ data: { user: null }, error: new Error("jwt expired") }));
    expect((res as Response).status).toBe(401);
  });

  it("refuses a method the function does not answer", async () => {
    const res = await authenticate(new Request("https://x/fn"), ["POST"], clientReturning({ data: { user: { id: "u" } }, error: null }));
    expect((res as Response).status).toBe(405);
  });

  it("returns the signed-in user", async () => {
    const res = await authenticate(post({ Authorization: "Bearer ok" }), ["POST"], clientReturning({ data: { user: { id: "u-1" } }, error: null }));
    expect(res instanceof Response ? null : res.user.id).toBe("u-1");
  });
});

describe("readJsonBody", () => {
  it.each([["[1,2]"], ["null"], ["not json"]])("reads %s as no body", async (body) => {
    expect(await readJsonBody(new Request("https://x", { method: "POST", body }))).toBeNull();
  });
});
