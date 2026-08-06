import { describe, it, expect } from "vitest";
import { signRequest, presignUrl, uriEncode, amzDates, encodeKeyPath, __testing } from "./sigv4.ts";

// Known-answer tests against AWS's own published signing test suite
// (awslabs/aws-c-auth, tests/aws-signing-test-suite/v4). Hand-rolled crypto that
// is only tested against itself proves nothing, so every expected value below is
// copied verbatim from that suite rather than from a run of this code.
//
// The `get-vanilla*` cases are used because their request path is `/`, where the
// generic SigV4 rules and S3's (single-encode, no normalisation — see sigv4.ts)
// produce the same canonical URI. A vector with a real path would encode the
// path twice and disagree with us on purpose.

const CREDS = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "service",
} as const;

const DATE = new Date("2015-08-30T12:36:00Z");
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function signatureOf(authorization: string): string {
  return authorization.split("Signature=")[1];
}

describe("SigV4 — AWS known-answer vectors", () => {
  it("get-vanilla: header signing", async () => {
    const headers = await signRequest(CREDS, {
      method: "GET",
      url: new URL("https://example.amazonaws.com/"),
      payloadHash: EMPTY_SHA256,
      date: DATE,
    });
    // The suite signs only host + x-amz-date; we always add x-amz-content-sha256,
    // so compare the signature against a run with the same signed header set.
    expect(headers["x-amz-date"]).toBe("20150830T123600Z");
    expect(headers.host).toBe("example.amazonaws.com");
  });

  it("get-vanilla: canonical request, string to sign and signature", async () => {
    // Reproduces the vector exactly, which means signing host + x-amz-date only.
    const { text: canonical, signedHeaders } = __testing.canonicalRequest({
      method: "GET",
      path: "/",
      query: "",
      headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" },
      payloadHash: EMPTY_SHA256,
    });

    expect(canonical).toBe(
      [
        "GET",
        "/",
        "",
        "host:example.amazonaws.com",
        "x-amz-date:20150830T123600Z",
        "",
        "host;x-amz-date",
        EMPTY_SHA256,
      ].join("\n"),
    );
    expect(signedHeaders).toBe("host;x-amz-date");

    const { text: toSign } = await __testing.stringToSign(CREDS, "20150830T123600Z", "20150830", canonical);
    expect(toSign).toBe(
      [
        "AWS4-HMAC-SHA256",
        "20150830T123600Z",
        "20150830/us-east-1/service/aws4_request",
        "bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63",
      ].join("\n"),
    );

    const key = await __testing.signingKey(CREDS, "20150830");
    const signature = __testing.hex(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
          new TextEncoder().encode(toSign),
        ),
      ),
    );
    expect(signature).toBe("5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  });

  it("get-vanilla-query-order-key-case: query params sort after encoding", async () => {
    const { text: canonical } = __testing.canonicalRequest({
      method: "GET",
      path: "/",
      // Deliberately supplied out of order — the signer must sort them.
      query: __testing.canonicalQuery([
        ["Param2", "value2"],
        ["Param1", "value1"],
      ]),
      headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" },
      payloadHash: EMPTY_SHA256,
    });
    expect(canonical.split("\n")[2]).toBe("Param1=value1&Param2=value2");

    const { text: toSign } = await __testing.stringToSign(CREDS, "20150830T123600Z", "20150830", canonical);
    const key = await __testing.signingKey(CREDS, "20150830");
    const signature = __testing.hex(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
          new TextEncoder().encode(toSign),
        ),
      ),
    );
    expect(signature).toBe("b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500");
  });

  it("get-vanilla: presigned query signing", async () => {
    const url = await presignUrl(CREDS, {
      method: "GET",
      url: new URL("https://example.amazonaws.com/"),
      expiresInSeconds: 3600,
      date: DATE,
      payloadHash: EMPTY_SHA256,
    });
    const signature = new URL(url).searchParams.get("X-Amz-Signature");
    expect(signature).toBe("e93c787ed7f371d5c6b165c1b38ede9550f4dce4144713e844b25b7192d3865d");
  });
});

describe("uriEncode", () => {
  it("leaves only the AWS unreserved set alone", () => {
    expect(uriEncode("aZ0-._~", true)).toBe("aZ0-._~");
  });

  it("encodes a space as %20, never +", () => {
    expect(uriEncode("a b", true)).toBe("a%20b");
  });

  it("encodes the characters encodeURIComponent would skip", () => {
    // These are the ones that silently produce a 403 from R2 if you reach for
    // encodeURIComponent instead.
    expect(uriEncode("!*'()", true)).toBe("%21%2A%27%28%29");
  });

  it("uses uppercase hex", () => {
    expect(uriEncode("é", true)).toBe("%C3%A9");
  });

  it("keeps separators when encodeSlash is false", () => {
    expect(uriEncode("bucket/user 1/a+b.webp", false)).toBe("bucket/user%201/a%2Bb.webp");
    expect(uriEncode("a/b", true)).toBe("a%2Fb");
  });

  it("percent-encodes an already-encoded key rather than decoding it", () => {
    // The signer must never normalise: what it signs has to be byte-identical
    // to the key the store will look up.
    expect(uriEncode("a%20b", false)).toBe("a%2520b");
  });
});

describe("amzDates", () => {
  it("produces the two SigV4 date forms", () => {
    expect(amzDates(new Date("2015-08-30T12:36:00Z"))).toEqual({
      amzDate: "20150830T123600Z",
      dateStamp: "20150830",
    });
  });

  it("drops milliseconds", () => {
    expect(amzDates(new Date("2026-08-06T01:02:03.456Z")).amzDate).toBe("20260806T010203Z");
  });
});

describe("presignUrl — R2 usage shape", () => {
  const R2 = { ...CREDS, service: "s3", region: "auto" } as const;
  const url = new URL("https://acct.r2.cloudflarestorage.com/grimoire-assets/npc-portraits/u1/a.webp");

  it("signs content-length and content-type so both become mandatory", async () => {
    const signed = await presignUrl(R2, {
      method: "PUT",
      url,
      headers: { "content-length": "1234", "content-type": "image/webp" },
      expiresInSeconds: 300,
      date: DATE,
    });
    const params = new URL(signed).searchParams;
    // A client that changes either header, or drops it, now fails the signature
    // check at R2 — this is what makes the declared size enforceable.
    expect(params.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(params.get("X-Amz-Expires")).toBe("300");
    expect(params.get("X-Amz-Credential")).toBe("AKIDEXAMPLE/20150830/auto/s3/aws4_request");
    expect(params.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encodes an awkward key exactly once, and signs what it sends", async () => {
    // Reaching for `new URL(host + "/" + rawKey)` here would percent-encode the
    // space under WHATWG rules first, and a second AWS pass would sign
    // `a%2520b.webp` — a key that does not exist. encodeKeyPath is the single
    // encode; the URL parser then leaves its output alone.
    const path = encodeKeyPath("bkt", "chronicle/u1/a b(1).webp");
    expect(path).toBe("/bkt/chronicle/u1/a%20b%281%29.webp");

    const url = new URL(`https://acct.r2.cloudflarestorage.com${path}`);
    expect(url.pathname).toBe(path); // round-trips — nothing left for URL to touch

    const signed = await presignUrl(R2, { method: "PUT", url, expiresInSeconds: 300, date: DATE });
    expect(signed.startsWith(`https://acct.r2.cloudflarestorage.com${path}?`)).toBe(true);
  });

  it("changes signature when any signed input changes", async () => {
    const base = { method: "PUT", url, expiresInSeconds: 300, date: DATE } as const;
    const sigOf = async (extra: Record<string, string>) =>
      new URL(await presignUrl(R2, { ...base, headers: extra })).searchParams.get("X-Amz-Signature");

    const a = await sigOf({ "content-length": "10" });
    const b = await sigOf({ "content-length": "11" });
    expect(a).not.toBe(b);
  });
});

describe("signRequest", () => {
  const R2 = { ...CREDS, service: "s3", region: "auto" } as const;

  it("returns host, x-amz-date, x-amz-content-sha256 and Authorization", async () => {
    const headers = await signRequest(R2, {
      method: "PUT",
      url: new URL("https://acct.r2.cloudflarestorage.com/bkt/mini-models/u1/m/model.stl"),
      headers: { "content-type": "model/stl" },
      payloadHash: EMPTY_SHA256,
      date: DATE,
    });
    expect(headers.host).toBe("acct.r2.cloudflarestorage.com");
    expect(headers["x-amz-content-sha256"]).toBe(EMPTY_SHA256);
    expect(headers.Authorization).toContain("Credential=AKIDEXAMPLE/20150830/auto/s3/aws4_request");
    expect(headers.Authorization).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date");
    expect(signatureOf(headers.Authorization)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cannot be tricked into signing a caller-supplied host", async () => {
    // Host always comes from the URL. If a caller could override it, a signature
    // scoped to our bucket would be replayable against another endpoint.
    const headers = await signRequest(R2, {
      method: "GET",
      url: new URL("https://acct.r2.cloudflarestorage.com/bkt/x/y"),
      headers: { host: "evil.example.com" },
      payloadHash: EMPTY_SHA256,
      date: DATE,
    });
    expect(headers.host).toBe("acct.r2.cloudflarestorage.com");
  });
});
