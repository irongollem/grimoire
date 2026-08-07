import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "./grimoire-cdn-worker.js";

// The Worker is the only thing between a stored URL and its bytes, and it has no
// staging environment — a mistake here is a site-wide broken-image event. These
// tests stand in fakes for the two things it talks to: the R2 binding and the
// Supabase origin.

const ORIGIN_PREFIX = "https://ypdokpdpvtmyzkltnmsq.supabase.co/storage/v1/object/public";

/** Minimal stand-in for an R2Object. */
function r2Object({ key, body = "bytes", size = null, etag = '"abc"', contentType = "image/webp", range = null }) {
  return {
    key,
    size: size ?? body.length,
    httpEtag: etag,
    body,
    range,
    writeHttpMetadata(headers) {
      headers.set("content-type", contentType);
    },
  };
}

/** Fake R2 binding holding a fixed set of keys. */
function fakeBucket(objects) {
  return {
    get: vi.fn(async (key, options) => {
      const entry = objects[key];
      if (!entry) return null;
      if (typeof entry === "function") return entry(options);
      return entry;
    }),
    head: vi.fn(async (key) => {
      const entry = objects[key];
      if (!entry || typeof entry === "function") return null;
      return entry;
    }),
  };
}

/** Fake edge cache (caches.default) recording matches and puts. */
function fakeEdgeCache(store = new Map()) {
  return {
    store,
    match: vi.fn(async (request) => store.get(request.url) ?? undefined),
    put: vi.fn(async (request, response) => {
      store.set(request.url, response);
    }),
  };
}

/** ctx stub whose waitUntil resolves promises inline so tests can await them. */
function fakeCtx() {
  const pending = [];
  return { pending, waitUntil: vi.fn((p) => pending.push(p)) };
}

let fetchMock;

let edgeCache;

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response("origin-bytes", {
      status: 200,
      headers: { "content-type": "image/webp", "cache-control": "max-age=3600" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  edgeCache = fakeEdgeCache();
  vi.stubGlobal("caches", { default: edgeCache });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (path, init) => new Request(`https://cdn.dungeongrimoire.com${path}`, init);

describe("method and path guards", () => {
  it("refuses anything but GET and HEAD", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await worker.fetch(get("/npc-portraits/u1/a.webp", { method }), {});
      expect(res.status).toBe(405);
    }
    // A PUT reaching the origin would be the worst possible outcome: this
    // hostname must never be a write path.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a bare bucket listing without touching the origin", async () => {
    for (const path of ["/", "/npc-portraits", "/npc-portraits/"]) {
      const res = await worker.fetch(get(path), {});
      expect(res.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("no R2 binding — stage-1 behaviour", () => {
  it("proxies to the Supabase origin", async () => {
    // Deploying the Worker before the R2 bucket exists must change nothing.
    const res = await worker.fetch(get("/npc-portraits/u1/a.webp"), {});
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN_PREFIX}/npc-portraits/u1/a.webp`);
  });

  it("overrides Cache-Control on a 200 and advertises range support", async () => {
    const res = await worker.fetch(get("/npc-portraits/u1/a.webp"), {});
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=2678400, immutable");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("forwards Range and leaves a 206's Cache-Control alone", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("part", { status: 206, headers: { "content-range": "bytes 0-3/100" } }),
    );
    const res = await worker.fetch(get("/sounds/u1/a.ogg", { headers: { range: "bytes=0-3" } }), {});
    expect(fetchMock.mock.calls[0][1].headers.get("range")).toBe("bytes=0-3");
    expect(res.status).toBe(206);
    // Rewriting Cache-Control on a partial confuses range caching.
    expect(res.headers.get("Cache-Control")).not.toBe("public, max-age=2678400, immutable");
  });
});

describe("R2 dual-read", () => {
  it("serves a hit from R2 without touching the origin", async () => {
    const env = { ASSETS: fakeBucket({ "mini-models/u1/m/model.stl": r2Object({ key: "mini-models/u1/m/model.stl", contentType: "model/stl" }) }) };
    const res = await worker.fetch(get("/mini-models/u1/m/model.stl"), env);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("model/stl");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=2678400, immutable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to Supabase when the R2 read throws", async () => {
    // The difference between a bad afternoon and a site-wide outage: R2 having
    // any kind of problem must degrade to the origin, not 500 every asset.
    const env = { ASSETS: { get: vi.fn(async () => { throw new Error("R2 unavailable"); }) } };
    const res = await worker.fetch(get("/npc-portraits/u1/a.webp"), env);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("origin-bytes");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back to Supabase on an R2 miss", async () => {
    // This is the copy window: bytes exist in one store or the other, and a
    // fallback that 404'd instead would break every not-yet-copied object.
    const env = { ASSETS: fakeBucket({}) };
    const res = await worker.fetch(get("/npc-portraits/u1/a.webp"), env);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("origin-bytes");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("looks the object up by the decoded pathname, minus the leading slash", async () => {
    // The key equals the CDN pathname — that identity is why the cutover
    // rewrote no stored URLs — but R2 keys are raw, and the URL is encoded.
    const env = { ASSETS: fakeBucket({}) };
    await worker.fetch(get("/chronicle/u1/a%20b.webp"), env);
    expect(env.ASSETS.get.mock.calls[0][0]).toBe("chronicle/u1/a b.webp");
  });

  it("falls back rather than 500ing on an undecodable path", async () => {
    const env = { ASSETS: fakeBucket({}) };
    const res = await worker.fetch(get("/chronicle/u1/%E0%A4%A.webp"), env);
    expect(res.status).toBe(404);
  });

  it("passes Range through to R2 and answers 206 with Content-Range", async () => {
    // Without this, every soundboard track is unseekable and re-downloads in
    // full — the bug that stage 1's origin path was fixed for.
    const env = {
      ASSETS: fakeBucket({
        "sounds/u1/a.ogg": (options) => {
          expect(options.range).toBeTruthy();
          return r2Object({
            key: "sounds/u1/a.ogg",
            body: "part",
            size: 100,
            contentType: "audio/ogg",
            range: { offset: 10, length: 4 },
          });
        },
      }),
    };
    const res = await worker.fetch(get("/sounds/u1/a.ogg", { headers: { range: "bytes=10-13" } }), env);

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 10-13/100");
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("answers 304 for a matching If-None-Match", async () => {
    const env = {
      ASSETS: fakeBucket({
        "npc-portraits/u1/a.webp": {
          key: "npc-portraits/u1/a.webp",
          size: 4,
          httpEtag: '"abc"',
          body: undefined,
          range: null,
          writeHttpMetadata: (h) => h.set("content-type", "image/webp"),
        },
      }),
    };
    const res = await worker.fetch(
      get("/npc-portraits/u1/a.webp", { headers: { "if-none-match": '"abc"' } }),
      env,
    );
    expect(res.status).toBe(304);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves HEAD from R2 via bucket.head — metadata only, never the body", async () => {
    // bucket.get() would pull a 50 MB model out of R2 to answer a request that
    // carries no body at all.
    const env = { ASSETS: fakeBucket({ "chronicle/u1/a.webp": r2Object({ key: "chronicle/u1/a.webp", body: "1234" }) }) };
    const res = await worker.fetch(get("/chronicle/u1/a.webp", { method: "HEAD" }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(res.body).toBeNull();
    expect(env.ASSETS.head).toHaveBeenCalledOnce();
    expect(env.ASSETS.get).not.toHaveBeenCalled();
  });

  it("answers 304, not 412, to an If-Modified-Since-only revalidation", async () => {
    // If-None-Match / If-Modified-Since are the cache-revalidation family; a
    // client validating by Last-Modified alone must get 304 ("use your copy"),
    // not 412 ("hard error"). R2 signals both the same way — a body-less object.
    const env = {
      ASSETS: fakeBucket({
        "npc-portraits/u1/a.webp": {
          key: "npc-portraits/u1/a.webp",
          size: 4,
          httpEtag: '"abc"',
          body: undefined,
          range: null,
          writeHttpMetadata: (h) => h.set("content-type", "image/webp"),
        },
      }),
    };
    const res = await worker.fetch(
      get("/npc-portraits/u1/a.webp", { headers: { "if-modified-since": "Wed, 05 Aug 2026 00:00:00 GMT" } }),
      env,
    );
    expect(res.status).toBe(304);
  });
});

describe("edge cache", () => {
  it("stores a full R2-served 200 and serves the repeat from the edge", async () => {
    // A Worker-built Response is NOT auto-cached by Cloudflare regardless of its
    // Cache-Control — without an explicit put(), every view of an R2-backed
    // asset would be a fresh Worker invocation + R2 read, reinstating the
    // per-request cost stage 2 exists to remove.
    const env = { ASSETS: fakeBucket({ "chronicle/u1/a.webp": r2Object({ key: "chronicle/u1/a.webp" }) }) };
    const ctx = fakeCtx();

    const first = await worker.fetch(get("/chronicle/u1/a.webp"), env, ctx);
    expect(first.status).toBe(200);
    await Promise.all(ctx.pending);
    expect(edgeCache.put).toHaveBeenCalledOnce();

    const second = await worker.fetch(get("/chronicle/u1/a.webp"), env, fakeCtx());
    expect(await second.text()).toBe("bytes");
    expect(env.ASSETS.get).toHaveBeenCalledOnce(); // only the first request hit R2
  });

  it("never caches Range responses or HEADs", async () => {
    const env = {
      ASSETS: fakeBucket({
        "sounds/u1/a.ogg": (_options) =>
          r2Object({ key: "sounds/u1/a.ogg", body: "part", size: 100, contentType: "audio/ogg", range: { offset: 0, length: 4 } }),
      }),
    };
    const ctx = fakeCtx();
    await worker.fetch(get("/sounds/u1/a.ogg", { headers: { range: "bytes=0-3" } }), env, ctx);
    await worker.fetch(get("/sounds/u1/a.ogg", { method: "HEAD" }), env, ctx);
    await Promise.all(ctx.pending);
    expect(edgeCache.put).not.toHaveBeenCalled();
  });

  it("still works with no caches global at all", async () => {
    // The guard exists for test environments and API drift — a missing Cache
    // API must degrade to uncached serving, never throw.
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    const env = { ASSETS: fakeBucket({ "chronicle/u1/a.webp": r2Object({ key: "chronicle/u1/a.webp" }) }) };
    const res = await worker.fetch(get("/chronicle/u1/a.webp"), env, fakeCtx());
    expect(res.status).toBe(200);
  });
});
