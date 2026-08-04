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
