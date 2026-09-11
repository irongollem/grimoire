import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type ExtendableEvent = { waitUntil: (promise: Promise<unknown>) => void };

function loadInstallHandler(fetchMock: ReturnType<typeof vi.fn>) {
  class ScopedRequest extends Request {
    constructor(input: string | URL | Request, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, "https://app.example.test") : input as Request, init);
    }
  }
  const handlers = new Map<string, (event: ExtendableEvent) => void>();
  const put = vi.fn(async (_path: string, _response: Response) => undefined);
  const deleteCache = vi.fn(async () => true);
  const skipWaiting = vi.fn();
  const cacheStorage = {
    open: vi.fn(async () => ({ match: vi.fn(), put })),
    match: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
    delete: deleteCache,
  };
  const worker = {
    location: { origin: "https://app.example.test" },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting,
    addEventListener: (type: string, handler: (event: ExtendableEvent) => void) => {
      handlers.set(type, handler);
    },
  };

  const template = readFileSync(resolve(process.cwd(), "scripts/sw-template.js"), "utf8");
  const source = template
    .replaceAll("__PRECACHE__", JSON.stringify(["/index.html", "/assets/app-123.js", "/assets/app-123.css"]))
    .replaceAll("__MUTABLE__", JSON.stringify(["/assets/placeholders/npc.webp"]))
    .replaceAll("__CACHE_NAME__", "grimoire-test")
    .replaceAll("__ASSET_CDN_ORIGIN__", JSON.stringify(""));

  runInNewContext(source, {
    self: worker,
    caches: cacheStorage,
    fetch: fetchMock,
    Request: ScopedRequest,
    Response,
    URL,
    Promise,
    setTimeout,
  });

  const install = handlers.get("install");
  if (!install) throw new Error("service worker did not register an install handler");
  const installHandler = install;

  async function runInstall() {
    let lifetime: Promise<unknown> | undefined;
    installHandler({ waitUntil: (promise) => { lifetime = promise; } });
    if (!lifetime) throw new Error("install handler did not extend its lifetime");
    return lifetime;
  }

  return { runInstall, put, deleteCache, skipWaiting };
}

function response(body: string, contentType: string) {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

describe("service-worker atomic install", () => {
  it("rejects a 200 HTML fallback returned for a not-yet-provisioned JS chunk", async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = new URL(request.url, "https://app.example.test").pathname;
      if (path.endsWith(".css")) return response("body{}", "text/css");
      return response("<!doctype html>", "text/html; charset=utf-8");
    });
    const { runInstall, put, deleteCache } = loadInstallHandler(fetchMock);

    await expect(runInstall()).rejects.toThrow("precache failed for 1 critical asset");
    expect(deleteCache).toHaveBeenCalledExactlyOnceWith("grimoire-test");
    expect(put.mock.calls.some(([path]) => path === "/assets/app-123.js")).toBe(false);
  });

  it("installs only after the complete executable shell has valid content types", async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = new URL(request.url, "https://app.example.test").pathname;
      if (path.endsWith(".js")) return response("export {};", "application/javascript");
      if (path.endsWith(".css")) return response("body{}", "text/css");
      return response("<!doctype html>", "text/html; charset=utf-8");
    });
    const { runInstall, put, deleteCache, skipWaiting } = loadInstallHandler(fetchMock);

    await expect(runInstall()).resolves.toBeUndefined();
    expect(put).toHaveBeenCalledTimes(3);
    expect(deleteCache).not.toHaveBeenCalled();
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });
});

// ── Runtime cache + activation ────────────────────────────────────────────
//
// The precache is the boot shell only (47 files, ~2.3 MB) — it used to be all
// of dist/ under 3 MB, i.e. 36.4 MB on a first visit. Everything outside the
// shell now arrives through the runtime cache, so these cover the parts that
// replaced the precache rather than the parts that survived it.

interface FakeCache {
  match: (req: Request | string) => Promise<Response | undefined>;
  put: (req: Request | string, res: Response) => Promise<void>;
  keys: () => Promise<Request[]>;
  delete: (req: Request | string) => Promise<boolean>;
}

function contentTypeFor(path: string) {
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  return "image/webp";
}

function loadWorker(options: {
  precache?: string[];
  mutable?: string[];
  seed?: Record<string, Record<string, string>>;
  fetchMock?: ReturnType<typeof vi.fn>;
  /** `__ASSET_CDN_ORIGIN__` — "" (the default) reproduces "no CDN configured". */
  assetCdnOrigin?: string;
}) {
  const ORIGIN = "https://app.example.test";
  const stores = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(options.seed ?? {})) {
    // Content type must follow the path: the worker validates MIME on every
    // executable asset, so a seeded .js served as image/webp is rejected.
    stores.set(name, new Map(Object.entries(entries).map(([k, v]) => [k, response(v, contentTypeFor(k))])));
  }
  const keyOf = (req: Request | string) =>
    typeof req === "string" ? req : new URL(req.url, ORIGIN).pathname;

  function open(name: string): FakeCache {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req) => store.get(keyOf(req)),
      put: async (req, res) => void store.set(keyOf(req), res),
      keys: async () => [...store.keys()].map((k) => new Request(new URL(k, ORIGIN))),
      delete: async (req) => store.delete(keyOf(req)),
    };
  }

  const deleted: string[] = [];
  const handlers = new Map<string, (event: never) => void>();
  const fetchMock = options.fetchMock ?? vi.fn(async () => response("fresh", "image/webp"));

  const source = readFileSync(resolve(process.cwd(), "scripts/sw-template.js"), "utf8")
    .replaceAll("__PRECACHE__", JSON.stringify(options.precache ?? []))
    .replaceAll("__MUTABLE__", JSON.stringify(options.mutable ?? []))
    .replaceAll("__CACHE_NAME__", "grimoire-test")
    .replaceAll("__ASSET_CDN_ORIGIN__", JSON.stringify(options.assetCdnOrigin ?? ""));

  runInNewContext(source, {
    self: {
      location: { origin: ORIGIN },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(),
      addEventListener: (type: string, handler: (event: never) => void) => {
        handlers.set(type, handler);
      },
    },
    caches: {
      open: async (name: string) => open(name),
      match: async (req: Request | string) => {
        for (const store of stores.values()) {
          const hit = store.get(keyOf(req));
          if (hit) return hit;
        }
        return undefined;
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => {
        deleted.push(name);
        return stores.delete(name);
      },
    },
    fetch: fetchMock,
    Request,
    Response,
    URL,
    Promise,
    setTimeout,
  });

  async function runActivate() {
    let lifetime: Promise<unknown> | undefined;
    (handlers.get("activate") as (e: { waitUntil: (p: Promise<unknown>) => void }) => void)({
      waitUntil: (p) => { lifetime = p; },
    });
    await lifetime;
  }

  async function runFetch(path: string) {
    const waited: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    (handlers.get("fetch") as (e: unknown) => void)({
      request: new Request(new URL(path, ORIGIN)),
      respondWith: (p: Promise<Response>) => { responded = p; },
      waitUntil: (p: Promise<unknown>) => { waited.push(p); },
    });
    const result = await responded;
    await Promise.all(waited);
    return { result, revalidated: waited.length > 0 };
  }

  async function runInstall() {
    let lifetime: Promise<unknown> | undefined;
    (handlers.get("install") as (e: { waitUntil: (p: Promise<unknown>) => void }) => void)({
      waitUntil: (p) => { lifetime = p; },
    });
    return lifetime;
  }

  return { runActivate, runFetch, runInstall, deleted, fetchMock, stores };
}

describe("service-worker activation", () => {
  it("sweeps a previous deploy's cache but spares the runtime cache", async () => {
    // Deleting grimoire-runtime here would make every deploy re-download every
    // route and image the user had already paid for — the exact cost the
    // shell/runtime split exists to avoid.
    const { runActivate, deleted } = loadWorker({
      seed: { "grimoire-old": {}, "grimoire-test": {}, "grimoire-runtime": {} },
    });

    await runActivate();

    expect(deleted).toEqual(["grimoire-old"]);
  });
});

describe("service-worker runtime cache", () => {
  it("serves a content-hashed asset from cache without touching the network", async () => {
    const { runFetch, fetchMock } = loadWorker({
      seed: { "grimoire-runtime": { "/assets/plate-DXiZtau7.webp": "cached" } },
    });

    const { result, revalidated } = await runFetch("/assets/plate-DXiZtau7.webp");

    expect(await result!.text()).toBe("cached");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(revalidated).toBe(false);
  });

  it("revalidates a public/ asset in the background while serving the cached copy", async () => {
    // Same filename can mean new bytes after a deploy, so a hit is not proof.
    const { runFetch, fetchMock, stores } = loadWorker({
      mutable: ["/assets/placeholders/npc.webp"],
      seed: { "grimoire-runtime": { "/assets/placeholders/npc.webp": "stale" } },
    });

    const { result, revalidated } = await runFetch("/assets/placeholders/npc.webp");

    expect(await result!.text()).toBe("stale");
    expect(revalidated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stored = stores.get("grimoire-runtime")!.get("/assets/placeholders/npc.webp");
    expect(await stored!.text()).toBe("fresh");
  });

  it("caches an uncached asset on its first real use", async () => {
    const { runFetch, stores } = loadWorker({});

    const { result } = await runFetch("/assets/plate-DXiZtau7.webp");

    expect(await result!.text()).toBe("fresh");
    expect(stores.get("grimoire-runtime")!.has("/assets/plate-DXiZtau7.webp")).toBe(true);
  });

  it("passes through a non-asset request without caching it", async () => {
    const { runFetch, stores, fetchMock } = loadWorker({});

    await runFetch("/api/campaigns");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stores.has("grimoire-runtime")).toBe(false);
  });
});

describe("service-worker copy-forward", () => {
  it("copies a content-hashed asset forward from the previous deploy's cache", async () => {
    const fetchMock = vi.fn(async () => response("network", "application/javascript"));
    const { runInstall, fetchMock: fm, stores } = loadWorker({
      precache: ["/assets/app-DXiZtau7.js"],
      seed: { "grimoire-old": { "/assets/app-DXiZtau7.js": "carried" } },
      fetchMock,
    });

    await runInstall();

    expect(fm).not.toHaveBeenCalled();
    const stored = stores.get("grimoire-test")!.get("/assets/app-DXiZtau7.js");
    expect(await stored!.text()).toBe("carried");
  });

  it("refetches a public/ asset instead of carrying a stale copy forward", async () => {
    // public/ keeps its directory structure inside dist, so this path is served
    // from /assets/ while carrying no content hash. Testing the prefix alone
    // treated it as immutable and pinned last deploy's bytes permanently —
    // nothing else would ever have evicted them.
    const fetchMock = vi.fn(async () => response("fresh", "image/webp"));
    const { runInstall, stores } = loadWorker({
      precache: ["/assets/cardforge/loot-backs/dragons-watch-tc.webp"],
      mutable: ["/assets/cardforge/loot-backs/dragons-watch-tc.webp"],
      seed: { "grimoire-old": { "/assets/cardforge/loot-backs/dragons-watch-tc.webp": "stale" } },
      fetchMock,
    });

    await runInstall();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stored = stores.get("grimoire-test")!.get("/assets/cardforge/loot-backs/dragons-watch-tc.webp");
    expect(await stored!.text()).toBe("fresh");
  });
});

// ── CDN art cache (#864 / #877) ───────────────────────────────────────────
//
// This is the half of the story that undoes itself silently if it regresses:
// a swept ART_CACHE, or a runtime rule that fires with no CDN configured,
// produces no failing build and no visible symptom beyond "art re-downloads
// every deploy forever" — exactly why this needs its own coverage rather than
// trusting the activate/runtime-cache tests above to generalise.

const CDN_ORIGIN = "https://cdn.example.test";

describe("service-worker CDN art cache", () => {
  it("is inert when __ASSET_CDN_ORIGIN__ is empty — no CDN configured", async () => {
    const { runFetch, fetchMock } = loadWorker({ assetCdnOrigin: "" });

    // A request to what would be the CDN origin, but the worker was never
    // told about a CDN, so it must not intercept this — same as any other
    // cross-origin request it has never heard of (Supabase, OpenAI, …).
    const { result } = await runFetch(`${CDN_ORIGIN}/app-art/assets/placeholders/npc.abc12345.webp`);

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves CDN-origin art from the art cache, never from the precache, once the flag is on", async () => {
    const { runFetch, stores } = loadWorker({
      assetCdnOrigin: CDN_ORIGIN,
      // Mirrors a post-artStripPlugin dist/: the boot shell only, no art path
      // in it — this is what "the precache no longer contains art" means in
      // practice, since PRECACHE is just whatever array the build hands in.
      precache: ["/index.html", "/assets/app-123.js"],
    });

    const { result } = await runFetch(`${CDN_ORIGIN}/app-art/assets/placeholders/npc.abc12345.webp`);

    expect(await result!.text()).toBe("fresh");
    // CACHE_NAME (the precache) is never opened for this request at all.
    expect(stores.has("grimoire-test")).toBe(false);
    expect(stores.get("grimoire-art")?.has("/app-art/assets/placeholders/npc.abc12345.webp")).toBe(true);
  });

  it("survives an activate sweep that clears every other cache", async () => {
    // The one line this whole story hinges on: if activate ever swept
    // grimoire-art the way it sweeps a stale precache, every deploy would
    // silently re-download the entire art set for every visitor, forever.
    const { runActivate, deleted } = loadWorker({
      assetCdnOrigin: CDN_ORIGIN,
      seed: { "grimoire-old": {}, "grimoire-test": {}, "grimoire-runtime": {}, "grimoire-art": {} },
    });

    await runActivate();

    expect(deleted).toEqual(["grimoire-old"]);
  });

  it("evicts oldest-first once the art cache passes its bound", async () => {
    const ART_CACHE_MAX_ENTRIES = 400; // must track scripts/sw-template.js
    const { runFetch, stores } = loadWorker({ assetCdnOrigin: CDN_ORIGIN });

    // Seed directly rather than through `seed` — cheaper than round-tripping
    // 400 fetches, and the fake cache keys by pathname regardless of origin.
    const seeded = new Map<string, Response>();
    for (let i = 0; i < ART_CACHE_MAX_ENTRIES; i++) {
      seeded.set(`/app-art/assets/seed-${i}.webp`, response("seed", "image/webp"));
    }
    stores.set("grimoire-art", seeded);

    await runFetch(`${CDN_ORIGIN}/app-art/assets/new.webp`);

    const art = stores.get("grimoire-art")!;
    expect(art.size).toBe(ART_CACHE_MAX_ENTRIES);
    expect(art.has("/app-art/assets/seed-0.webp")).toBe(false); // oldest — evicted
    expect(art.has("/app-art/assets/new.webp")).toBe(true);
  });
});
