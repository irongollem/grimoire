import { describe, it, expect, vi } from "vitest";
import { createAuthAwareFetch } from "./authAwareFetch";

const REST = "https://project.supabase.co/rest/v1/campaigns?select=*";
const RPC = "https://project.supabase.co/rest/v1/rpc/check_quota";
const AUTH = "https://project.supabase.co/auth/v1/token?grant_type=refresh_token";

function fetchReturning(status: number): typeof fetch {
  return vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;
}

describe("createAuthAwareFetch", () => {
  it("passes the response through untouched", async () => {
    const wrapped = createAuthAwareFetch(fetchReturning(401), () => {});
    const response = await wrapped(RPC);
    expect(response.status).toBe(401);
  });

  it("signals when a PostgREST RPC comes back unauthenticated", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(401), onUnauthenticated);
    await wrapped(RPC);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("signals for table reads too, not just RPCs", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(401), onUnauthenticated);
    await wrapped(REST);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("stays quiet on a successful request", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(200), onUnauthenticated);
    await wrapped(REST);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  // An empty result is the failure mode this exists to catch, but it is
  // indistinguishable from a new account at this layer — only the 401 is proof.
  it("stays quiet on the 200 [] that a lost session actually produces", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(200), onUnauthenticated);
    await wrapped(REST);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  // A failed token refresh already arrives as SIGNED_OUT; reacting here as well
  // would sign the user out twice and race the store's own redirect.
  it("ignores a 401 from the auth endpoints", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(401), onUnauthenticated);
    await wrapped(AUTH);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("does not treat 403 as a lost session", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(403), onUnauthenticated);
    await wrapped(RPC);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("reads the URL from a URL object", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(401), onUnauthenticated);
    await wrapped(new URL(RPC));
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("reads the URL from a Request object", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(401), onUnauthenticated);
    await wrapped(new Request(RPC, { method: "POST" }));
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("forwards the init argument", async () => {
    const baseFetch = vi.fn(async () => new Response(null, { status: 200 }));
    const wrapped = createAuthAwareFetch(baseFetch as unknown as typeof fetch, () => {});
    const init = { method: "POST", headers: { "x-test": "1" } };
    await wrapped(RPC, init);
    expect(baseFetch).toHaveBeenCalledWith(RPC, init);
  });
});
