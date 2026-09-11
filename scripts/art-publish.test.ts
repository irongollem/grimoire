import { describe, expect, it, vi } from "vitest";
import { publish, contentTypeFor, type PublishDeps } from "./art-publish";
import { IMMUTABLE_CACHE_CONTROL, type R2Config } from "../supabase/functions/_shared/r2/config.ts";

const R2: R2Config = {
  accountId: "acc",
  bucket: "grimoire-assets",
  accessKeyId: "key",
  secretAccessKey: "secret",
  endpoint: "https://acc.r2.cloudflarestorage.com",
};

const ENTRY: [string, string] = ["/assets/placeholders/npc.webp", "app-art/assets/placeholders/npc.abc12345.webp"];

function makeDeps(overrides: Partial<PublishDeps> = {}): PublishDeps {
  return {
    putObject: vi.fn(async () => undefined),
    headObject: vi.fn(async () => null),
    readFile: vi.fn(() => Buffer.from("fake-bytes")),
    resolveSourceFile: vi.fn((servedPath: string) => `/repo/public${servedPath}`),
    ...overrides,
  };
}

describe("art-publish publish()", () => {
  it("skips an object that already exists at the same size (HEAD hit)", async () => {
    const deps = makeDeps({
      headObject: vi.fn(async () => ({ size: Buffer.from("fake-bytes").byteLength })),
    });

    const result = await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 0, skipped: 1, problems: [] });
  });

  it("uploads an object that does not exist in R2", async () => {
    const deps = makeDeps();

    const result = await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).toHaveBeenCalledOnce();
    expect(result).toEqual({ uploaded: 1, skipped: 0, problems: [] });
  });

  it("--dry-run reports what it would upload without writing anything", async () => {
    const deps = makeDeps();

    const result = await publish([ENTRY], R2, { dryRun: true, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 1, skipped: 0, problems: [] });
  });

  it("uploads with the immutable cache-control header", async () => {
    const deps = makeDeps();

    await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).toHaveBeenCalledWith(
      R2,
      expect.objectContaining({
        key: ENTRY[1],
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  });

  it("--verify reports a missing object without uploading it", async () => {
    const deps = makeDeps();

    const result = await publish([ENTRY], R2, { dryRun: false, verify: true, concurrency: 4 }, deps);

    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result.problems).toEqual([`missing from r2: ${ENTRY[1]}`]);
  });

  it("never deletes anything — there is no delete path at all", () => {
    const deps = makeDeps();
    expect((deps as unknown as Record<string, unknown>).deleteObjects).toBeUndefined();
  });
});

describe("contentTypeFor", () => {
  it("maps known art extensions to their MIME type", () => {
    expect(contentTypeFor("npc.webp")).toBe("image/webp");
    expect(contentTypeFor("icon.PNG")).toBe("image/png");
  });

  it("falls back to octet-stream for an unknown extension", () => {
    expect(contentTypeFor("mystery.bin")).toBe("application/octet-stream");
  });
});
