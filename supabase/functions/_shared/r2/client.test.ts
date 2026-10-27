import { describe, it, expect, vi, afterEach } from "vitest";
import { parseListResponse, headObject, putObject, getObject, deleteObjects, listObjects, __testing } from "./client.ts";
import { r2ConfigFrom } from "./config.ts";

const config = r2ConfigFrom((key) =>
  ({
    R2_ACCOUNT_ID: "acct123",
    R2_BUCKET: "grimoire-assets",
    R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
    R2_SECRET_ACCESS_KEY: "secret",
  })[key],
)!;

// A ListObjectsV2 body in the shape S3/R2 actually return, including the bits
// that break a naive parse: an escaped key, a nested key, and truncation.
const LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>grimoire-assets</Name>
  <Prefix>mini-models/u1/m7/</Prefix>
  <KeyCount>3</KeyCount>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>1/abc+def=</NextContinuationToken>
  <Contents>
    <Key>mini-models/u1/m7/model.stl</Key>
    <LastModified>2026-08-06T00:00:00.000Z</LastModified>
    <ETag>&quot;abc&quot;</ETag>
    <Size>1024</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>mini-models/u1/m7/nested/thumb.webp</Key>
    <Size>2048</Size>
  </Contents>
  <Contents>
    <Key>mini-models/u1/m7/rock &amp; roll.stl</Key>
    <Size>32</Size>
  </Contents>
</ListBucketResult>`;

describe("parseListResponse", () => {
  it("extracts every key", () => {
    expect(parseListResponse(LISTING).keys).toEqual([
      "mini-models/u1/m7/model.stl",
      "mini-models/u1/m7/nested/thumb.webp",
      "mini-models/u1/m7/rock & roll.stl",
    ]);
  });

  it("unescapes XML entities in a key", () => {
    // Deleting the escaped form targets a key that does not exist, and S3
    // answers 204 for that — a silent no-op that leaves the object behind.
    expect(parseListResponse(LISTING).keys[2]).toContain("rock & roll");
  });

  it("returns the continuation token when truncated", () => {
    expect(parseListResponse(LISTING).nextToken).toBe("1/abc+def=");
  });

  it("returns no token when the listing is complete", () => {
    const complete = LISTING
      .replace("<IsTruncated>true</IsTruncated>", "<IsTruncated>false</IsTruncated>")
      .replace("<NextContinuationToken>1/abc+def=</NextContinuationToken>", "");
    expect(parseListResponse(complete).nextToken).toBeNull();
  });

  it("ignores a token when IsTruncated is false", () => {
    // Trusting the token alone would loop forever on a complete listing.
    const stale = LISTING.replace("<IsTruncated>true</IsTruncated>", "<IsTruncated>false</IsTruncated>");
    expect(parseListResponse(stale).nextToken).toBeNull();
  });

  it("handles an empty listing", () => {
    expect(parseListResponse("<ListBucketResult><KeyCount>0</KeyCount></ListBucketResult>")).toEqual({
      keys: [],
      nextToken: null,
    });
  });

  it("does not mistake a CommonPrefixes entry for an object", () => {
    const withPrefixes = `<ListBucketResult>
      <CommonPrefixes><Prefix>mini-models/u1/</Prefix></CommonPrefixes>
      <Contents><Key>mini-models/u1/a.stl</Key></Contents>
    </ListBucketResult>`;
    expect(parseListResponse(withPrefixes).keys).toEqual(["mini-models/u1/a.stl"]);
  });
});

describe("headObject", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(headers: Record<string, string>, status = 200) {
    const fetchMock = vi.fn(async () => new Response(null, { status, headers }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("unquotes a non-multipart ETag", () => {
    stubFetch({ "content-length": "42", etag: '"d41d8cd98f00b204e9800998ecf8427e"' });
    return headObject(config, "app-art/assets/foo.webp").then((result) => {
      expect(result?.etag).toBe("d41d8cd98f00b204e9800998ecf8427e");
    });
  });

  it("strips a weak-validator prefix", () => {
    stubFetch({ "content-length": "42", etag: 'W/"d41d8cd98f00b204e9800998ecf8427e"' });
    return headObject(config, "app-art/assets/foo.webp").then((result) => {
      expect(result?.etag).toBe("d41d8cd98f00b204e9800998ecf8427e");
    });
  });

  it("returns null etag, not coerced, when the response carries none", () => {
    stubFetch({ "content-length": "42" });
    return headObject(config, "app-art/assets/foo.webp").then((result) => {
      expect(result?.etag).toBeNull();
    });
  });

  it("passes Last-Modified through as sent, and null when absent", async () => {
    stubFetch({ "content-length": "42", "last-modified": "Sat, 03 Oct 2026 21:52:46 GMT" });
    expect((await headObject(config, "app-art/assets/foo.webp"))?.lastModified).toBe("Sat, 03 Oct 2026 21:52:46 GMT");
    stubFetch({ "content-length": "42" });
    expect((await headObject(config, "app-art/assets/foo.webp"))?.lastModified).toBeNull();
  });

  it("reports an unknown size as null, never 0, and a known one as a number", async () => {
    stubFetch({ etag: '"abc"' });
    expect((await headObject(config, "app-art/assets/foo.webp"))?.size).toBeNull();
    stubFetch({ "content-length": "0" });
    expect((await headObject(config, "app-art/assets/empty.webp"))?.size).toBe(0);
  });

  it("returns null for a 404", () => {
    stubFetch({}, 404);
    return headObject(config, "app-art/assets/missing.webp").then((result) => {
      expect(result).toBeNull();
    });
  });
});

describe("bucketUrl", () => {
  it("AWS-encodes the query and round-trips through the URL parser", () => {
    // signRequest re-derives the canonical query from url.searchParams, so the
    // encoding written here must survive parsing unchanged or the signature
    // covers a different query than the one sent.
    const url = __testing.bucketUrl(config, { "list-type": "2", prefix: "mini-models/u1/" });
    expect(url.pathname).toBe("/grimoire-assets");
    expect(url.search).toBe("?list-type=2&prefix=mini-models%2Fu1%2F");
    expect(url.searchParams.get("prefix")).toBe("mini-models/u1/");
  });

  it("encodes a space as %20 rather than +", () => {
    // URLSearchParams would write `+` here, which SigV4 reads as a literal plus.
    const url = __testing.bucketUrl(config, { prefix: "chronicle/u 1/" });
    expect(url.search).toBe("?prefix=chronicle%2Fu%201%2F");
    expect(url.searchParams.get("prefix")).toBe("chronicle/u 1/");
  });
});

/**
 * A small in-memory R2: PUT/GET/HEAD/DELETE by object key and ListObjectsV2
 * with a prefix filter and two keys per page, so a test asserts what the store
 * holds rather than which requests were made.
 */
function stubStore(initial: Record<string, string> = {}, options: { failDelete?: string } = {}) {
  const objects = new Map(Object.entries(initial).map(([k, v]) => [k, new TextEncoder().encode(v)]));
  const PAGE = 2;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init: RequestInit) => {
      const url = new URL(String(input));
      const key = decodeURIComponent(url.pathname.replace(/^\/grimoire-assets\/?/, ""));
      switch (init.method) {
        case "PUT":
          objects.set(key, new Uint8Array(init.body as ArrayBuffer));
          return new Response(null, { status: 200 });
        case "GET": {
          if (url.searchParams.get("list-type") === "2") {
            const prefix = url.searchParams.get("prefix") ?? "";
            const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
            const from = Number(url.searchParams.get("continuation-token") ?? 0);
            const page = all.slice(from, from + PAGE);
            const more = from + PAGE < all.length;
            return new Response(
              `<ListBucketResult><IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + PAGE}</NextContinuationToken>` : ""}${page.map((k) => `<Contents><Key>${k}</Key></Contents>`).join("")}</ListBucketResult>`,
            );
          }
          const found = objects.get(key);
          return found ? new Response(found.slice().buffer) : new Response("missing", { status: 404 });
        }
        case "DELETE":
          if (key === options.failDelete) return new Response("boom", { status: 500 });
          // Real R2 answers 204 for an absent key; a 404 from a proxy or an older bucket must not fail the batch either.
          return objects.delete(key) ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
        default:
          return new Response(null, { status: 405 });
      }
    }),
  );
  return objects;
}

describe("the object operations, against an in-memory store", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stores bytes that read back unchanged, and reads a missing key as null rather than an error", async () => {
    stubStore();
    await putObject(config, { key: "chronicle/u1/a.webp", body: new TextEncoder().encode("hello"), contentType: "image/webp" });
    expect(new TextDecoder().decode((await getObject(config, "chronicle/u1/a.webp"))!)).toBe("hello");
    expect(await getObject(config, "chronicle/u1/none.webp")).toBeNull();
  });

  it("reports a failed upload instead of pretending it was stored", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    await expect(
      putObject(config, { key: "chronicle/u1/a.webp", body: new Uint8Array([1]), contentType: "image/webp" }),
    ).rejects.toThrow(/403/);
  });

  it("deletes the named keys and leaves their neighbours alone", async () => {
    const store = stubStore({ "chronicle/u1/a.webp": "a", "chronicle/u1/b.webp": "b", "chronicle/u2/a.webp": "other" });
    await deleteObjects(config, ["chronicle/u1/a.webp", "chronicle/u1/b.webp"]);
    expect([...store.keys()]).toEqual(["chronicle/u2/a.webp"]);
  });

  it("treats deleting a key that is already gone as success, so a re-run of a failed cleanup is safe", async () => {
    stubStore();
    await expect(deleteObjects(config, ["chronicle/u1/never-existed.webp"])).resolves.toBeUndefined();
  });

  it("still deletes the rest of a batch when one delete fails, and then reports the failure", async () => {
    const store = stubStore(
      { "chronicle/u1/a.webp": "a", "chronicle/u1/b.webp": "b", "chronicle/u1/c.webp": "c" },
      { failDelete: "chronicle/u1/b.webp" },
    );
    await expect(deleteObjects(config, ["chronicle/u1/a.webp", "chronicle/u1/b.webp", "chronicle/u1/c.webp"])).rejects.toThrow(/b\.webp/);
    expect([...store.keys()]).toEqual(["chronicle/u1/b.webp"]);
  });

  it("lists every key under a prefix across pages, and none from a sibling prefix", async () => {
    stubStore({
      "chronicle/u1/1.webp": "", "chronicle/u1/2.webp": "", "chronicle/u1/3.webp": "", "chronicle/u1/4.webp": "", "chronicle/u1/5.webp": "",
      "chronicle/u10/1.webp": "", "chronicle/u2/1.webp": "",
    });
    const keys = await listObjects(config, "chronicle/u1/");
    expect(keys).toEqual(["1", "2", "3", "4", "5"].map((n) => `chronicle/u1/${n}.webp`));
  });

  it("reports a failed listing rather than returning a partial one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 503 })));
    await expect(listObjects(config, "chronicle/u1/")).rejects.toThrow(/503/);
  });
});
