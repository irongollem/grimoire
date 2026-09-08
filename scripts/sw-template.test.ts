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
    .replaceAll("__CACHE_NAME__", "grimoire-test");

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
    .replaceAll("__CACHE_NAME__", "grimoire-test");

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
