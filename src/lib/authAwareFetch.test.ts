import { describe, it, expect, vi } from "vitest";
import { AnonymousReadError, createAuthAwareFetch } from "./authAwareFetch";

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

  // The 200 [] a lost session produces used to be considered undetectable here.
  // It is not — see the anon-key suite below, which stops the request instead.
  it("stays quiet on a 200 when no credential opinion is configured", async () => {
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

const ANON = "anon-publishable-key";
const JWT = "eyJhbGciOi.real-user-token.sig";

/** A fetch that would answer the way RLS answers an anon caller. */
function emptyOk(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response("[]", { status: 200 }));
}

function signedIn(believesSignedIn = () => true) {
  return { anonKey: ANON, believesSignedIn };
}

function bearing(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * The regression cover that did not exist when this shipped: a wake-up burst
 * resolving to the anon key, RLS answering 200 [], and the app caching the
 * emptiness as an answer. Nothing here inspects a response — the point is that
 * the request never leaves.
 */
describe("createAuthAwareFetch — anon-key reads while signed in", () => {
  it("refuses a table read that would go out bearing the anon key", async () => {
    const baseFetch = emptyOk();
    const wrapped = createAuthAwareFetch(baseFetch as unknown as typeof fetch, () => {}, signedIn());
    await expect(wrapped(REST, bearing(ANON))).rejects.toBeInstanceOf(AnonymousReadError);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("refuses a request carrying no credential at all", async () => {
    const baseFetch = emptyOk();
    const wrapped = createAuthAwareFetch(baseFetch as unknown as typeof fetch, () => {}, signedIn());
    await expect(wrapped(REST)).rejects.toBeInstanceOf(AnonymousReadError);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("reads the credential off a Request object too", async () => {
    const baseFetch = emptyOk();
    const wrapped = createAuthAwareFetch(baseFetch as unknown as typeof fetch, () => {}, signedIn());
    const request = new Request(REST, { headers: { Authorization: `Bearer ${ANON}` } });
    await expect(wrapped(request)).rejects.toBeInstanceOf(AnonymousReadError);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("lets a real user token through", async () => {
    const baseFetch = emptyOk();
    const wrapped = createAuthAwareFetch(baseFetch as unknown as typeof fetch, () => {}, signedIn());
    await expect(wrapped(REST, bearing(JWT))).resolves.toBeInstanceOf(Response);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  // Signed out, the anon key is the correct credential: the login screen, the
  // invite check, and the four library-source RPCs all rely on it.
  it("allows anon reads when the app is not signed in", async () => {
    const baseFetch = emptyOk();
    const wrapped = createAuthAwareFetch(
      baseFetch as unknown as typeof fetch,
      () => {},
      signedIn(() => false),
    );
    await expect(wrapped(REST, bearing(ANON))).resolves.toBeInstanceOf(Response);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("leaves the auth endpoints alone, which must reach anon", async () => {
    const baseFetch = emptyOk();
    const wrapped = createAuthAwareFetch(baseFetch as unknown as typeof fetch, () => {}, signedIn());
    await expect(wrapped(AUTH, bearing(ANON))).resolves.toBeInstanceOf(Response);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  // main.ts refetches the cache on TOKEN_REFRESHED, but only when reads were
  // actually starved — otherwise the hourly refresh would refetch everything.
  it("reports each refusal so recovery knows reads were starved", async () => {
    const onRefused = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(200), () => {}, {
      anonKey: ANON,
      believesSignedIn: () => true,
      onRefused,
    });
    await expect(wrapped(REST, bearing(ANON))).rejects.toBeInstanceOf(AnonymousReadError);
    expect(onRefused).toHaveBeenCalledTimes(1);
  });

  it("does not report a refusal when the request is allowed through", async () => {
    const onRefused = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(200), () => {}, {
      anonKey: ANON,
      believesSignedIn: () => true,
      onRefused,
    });
    await wrapped(REST, bearing(JWT));
    expect(onRefused).not.toHaveBeenCalled();
  });

  // The sign-out ladder in sessionRecovery gives up after three failures in 30s.
  // A wake burst is dozens of requests, so feeding it from here would boot a user
  // whose refresh token is still valid — recovery rides on TOKEN_REFRESHED instead.
  it("does not notify the sign-out ladder", async () => {
    const onUnauthenticated = vi.fn();
    const wrapped = createAuthAwareFetch(fetchReturning(200), onUnauthenticated, signedIn());
    await expect(wrapped(REST, bearing(ANON))).rejects.toBeInstanceOf(AnonymousReadError);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});
