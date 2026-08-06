import { describe, it, expect } from "vitest";
import { parseListResponse, __testing } from "./client.ts";
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
